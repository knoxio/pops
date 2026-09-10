/**
 * `POST /accounts/:id/sync` and `GET /accounts/:id/sync/:jobId` (POPS-2921):
 * a job to poll, the running job for a second trigger, and refusals for
 * accounts the action does not apply to.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { upsertImportConfig } from '../../db/services/account-import-config.js';
import { createAccount } from '../../db/services/accounts.js';
import { createFinanceApiApp } from '../app.js';
import {
  clearUpSyncJobs,
  setUpSyncRunnerForTests,
  type UpSyncRunner,
} from '../modules/up-bank/sync-jobs.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

import type { UpSyncResult } from '../modules/up-bank/sync.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-account-sync-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  setUpSyncRunnerForTests(null);
  clearUpSyncJobs();
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    })
  );
}

function upAccount(name = 'Up Everyday'): string {
  const id = createAccount(financeDb.db, { name, kind: 'savings', currency: 'AUD' }).id;
  upsertImportConfig(financeDb.db, {
    accountId: id,
    sourceKind: 'api',
    provider: 'up',
    externalAccountRef: 'up-acc-1',
    secretRef: 'UP_TOKEN',
  });
  return id;
}

function deferredRunner() {
  let resolve: (r: UpSyncResult) => void = () => {};
  const runner: UpSyncRunner = () =>
    new Promise<UpSyncResult>((res) => {
      resolve = res;
    });
  return { runner, resolve: (r: UpSyncResult) => resolve(r) };
}

function result(accountId: string): UpSyncResult {
  return {
    accountId,
    fetched: 4,
    staged: 3,
    alreadyStaged: 0,
    alreadyInLedger: 0,
    settled: 1,
    settleRefused: 0,
    alreadyHeld: 0,
    draftId: 'draft-1',
    warnings: [],
  };
}

describe('POST /accounts/:id/sync', () => {
  it('starts a job, which the progress route follows to its result', async () => {
    const id = upAccount();
    const deferred = deferredRunner();
    setUpSyncRunnerForTests(deferred.runner);

    const started = await client().accountImports.triggerSync(id);
    expect(started.data).toMatchObject({
      accountId: id,
      trigger: 'manual',
      status: 'running',
      result: null,
      error: null,
    });

    const running = await client().accountImports.getSyncJob(id, started.data.id);
    expect(running.data.status).toBe('running');

    deferred.resolve(result(id));
    await new Promise((res) => setImmediate(res));
    const done = await client().accountImports.getSyncJob(id, started.data.id);
    expect(done.data).toMatchObject({
      status: 'completed',
      result: {
        fetched: 4,
        staged: 3,
        settled: 1,
        settleRefused: 0,
        draftId: 'draft-1',
      },
    });
    expect(done.data.finishedAt).not.toBeNull();
  });

  it('hands a second trigger the job already running', async () => {
    const id = upAccount();
    const deferred = deferredRunner();
    setUpSyncRunnerForTests(deferred.runner);

    const first = await client().accountImports.triggerSync(id);
    const second = await client().accountImports.triggerSync(id);
    expect(second.data.id).toBe(first.data.id);
    deferred.resolve(result(id));
  });

  it('422s an account fed by a file or by hand', async () => {
    const csv = createAccount(financeDb.db, { name: 'ANZ', kind: 'checking', currency: 'AUD' }).id;
    upsertImportConfig(financeDb.db, {
      accountId: csv,
      sourceKind: 'csv-dialect',
      dialectId: 'ANZ',
    });
    const cash = createAccount(financeDb.db, { name: 'Wallet', kind: 'cash', currency: 'AUD' }).id;

    await expect(client().accountImports.triggerSync(csv)).rejects.toMatchObject({ status: 422 });
    await expect(client().accountImports.triggerSync(cash)).rejects.toMatchObject({ status: 422 });
  });

  it('404s an unknown account', async () => {
    await expect(client().accountImports.triggerSync('nope')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('GET /accounts/:id/sync/:jobId', () => {
  it('404s a job it never had, and a job that belongs to another account', async () => {
    const id = upAccount();
    const other = upAccount('Up Saver');
    const deferred = deferredRunner();
    setUpSyncRunnerForTests(deferred.runner);
    const started = await client().accountImports.triggerSync(other);

    await expect(client().accountImports.getSyncJob(id, 'nope')).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().accountImports.getSyncJob(id, started.data.id)).rejects.toMatchObject({
      status: 404,
    });
    deferred.resolve(result(other));
  });
});
