/**
 * The sync job registry (POPS-2921): the range a job derives, one job per
 * account at a time, and how a pass's outcome lands on the job.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { upsertImportConfig } from '../../../../db/services/account-import-config.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';
import {
  clearUpSyncJobs,
  getUpSyncJob,
  setUpSyncRunnerForTests,
  startUpSyncJob,
  syncRangeFor,
  type UpSyncRunner,
} from '../sync-jobs.js';
import { upAccount, upTransaction } from './fixtures.js';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { UpSyncResult } from '../sync.js';
import type { UpBankClient, UpTransaction } from '../up-api.js';

let db: FinanceDb;
let accountId: string;

function fakeUp(rows: UpTransaction[]): UpBankClient {
  const account = upAccount();
  return {
    ping: async () => ({ customerId: 'cust-1' }),
    listAccounts: async () => [account],
    getAccount: async () => account,
    getTransaction: async (id) => {
      const found = rows.find((row) => row.id === id);
      if (!found) throw new Error(`unknown Up transaction ${id}`);
      return found;
    },
    listTransactions: async () => rows,
  };
}

function configure(forAccount = accountId): void {
  upsertImportConfig(db, {
    accountId: forAccount,
    sourceKind: 'api',
    provider: 'up',
    externalAccountRef: 'up-acc-1',
    secretRef: 'UP_TOKEN',
  });
}

function fakeResult(overrides: Partial<UpSyncResult> = {}): UpSyncResult {
  return {
    accountId,
    fetched: 3,
    staged: 2,
    alreadyStaged: 0,
    alreadyInLedger: 0,
    settled: 1,
    settleRefused: 0,
    alreadyHeld: 0,
    draftId: 'draft-1',
    warnings: [],
    ...overrides,
  };
}

/** A runner the test resolves by hand, so a job can be observed mid-flight. */
function deferredRunner() {
  let resolve: (result: UpSyncResult) => void = () => {};
  let reject: (err: Error) => void = () => {};
  const calls: string[] = [];
  const runner: UpSyncRunner = (_db, _contacts, args) => {
    calls.push(args.accountId);
    return new Promise<UpSyncResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  };
  return {
    runner,
    calls,
    resolve: (r: UpSyncResult) => resolve(r),
    reject: (e: Error) => reject(e),
  };
}

beforeEach(() => {
  ({ db } = freshMigratedFinanceDb());
  accountId = createAccount(db, { name: 'Up Everyday', kind: 'savings', currency: 'AUD' }).id;
});

afterEach(() => {
  setUpSyncRunnerForTests(null);
  clearUpSyncJobs();
});

describe('syncRangeFor', () => {
  it('looks back ninety days for an account with no rows', () => {
    expect(syncRangeFor(db, accountId, '2026-09-06')).toEqual({
      from: '2026-06-08',
      to: '2026-09-06',
    });
  });

  it('starts two days before the newest transaction once there are rows', async () => {
    configure();
    const client = fakeUp([
      upTransaction({ id: 'a', cents: -1_200, createdAt: '2026-09-02T09:00:00+10:00' }),
      upTransaction({ id: 'b', cents: -500, createdAt: '2026-09-04T09:00:00+10:00' }),
    ]);
    const job = await startUpSyncJob(db, makeContactsFake(), {
      accountId,
      trigger: 'manual',
      client,
      asOf: '2026-09-05',
    }).done;
    expect(job.status).toBe('completed');

    expect(syncRangeFor(db, accountId, '2026-09-10')).toEqual({
      from: '2026-09-02',
      to: '2026-09-10',
    });
  });

  it('never starts after it ends when the newest row is dated past asOf', async () => {
    configure();
    const client = fakeUp([
      upTransaction({ id: 'z', cents: -100, createdAt: '2026-09-20T09:00:00+10:00' }),
    ]);
    await startUpSyncJob(db, makeContactsFake(), {
      accountId,
      trigger: 'manual',
      client,
      asOf: '2026-09-21',
    }).done;

    expect(syncRangeFor(db, accountId, '2026-09-10')).toEqual({
      from: '2026-09-10',
      to: '2026-09-10',
    });
  });
});

describe('startUpSyncJob', () => {
  it('runs the pass and lands its outcome on the job, warnings flattened to text', async () => {
    const deferred = deferredRunner();
    setUpSyncRunnerForTests(deferred.runner);

    const started = startUpSyncJob(db, makeContactsFake(), {
      accountId,
      trigger: 'schedule',
      asOf: '2026-09-06',
    });
    expect(started.reused).toBe(false);
    expect(started.job).toMatchObject({
      accountId,
      trigger: 'schedule',
      status: 'running',
      from: '2026-06-08',
      to: '2026-09-06',
      finishedAt: null,
      result: null,
      error: null,
    });
    expect(getUpSyncJob(started.job.id)?.status).toBe('running');

    deferred.resolve(
      fakeResult({
        warnings: [
          { type: 'CHECKPOINT_MISMATCH', message: 'off', details: 'expected 1c, Up says 2c' },
        ],
      })
    );
    const done = await started.done;
    expect(done.status).toBe('completed');
    expect(done.finishedAt).not.toBeNull();
    expect(done.result).toEqual({
      fetched: 3,
      staged: 2,
      alreadyStaged: 0,
      alreadyInLedger: 0,
      settled: 1,
      settleRefused: 0,
      alreadyHeld: 0,
      draftId: 'draft-1',
      warnings: ['CHECKPOINT_MISMATCH: expected 1c, Up says 2c'],
    });
    expect(getUpSyncJob(started.job.id)).toEqual(done);
  });

  it('carries a pass that refused settlements onto the job as its own count', async () => {
    const deferred = deferredRunner();
    setUpSyncRunnerForTests(deferred.runner);
    const started = startUpSyncJob(db, makeContactsFake(), {
      accountId,
      trigger: 'schedule',
      asOf: '2026-09-06',
    });

    deferred.resolve(fakeResult({ settled: 0, settleRefused: 2 }));

    const done = await started.done;
    expect(done.status).toBe('completed');
    expect(done.result).toMatchObject({ settled: 0, settleRefused: 2 });
    expect(getUpSyncJob(started.job.id)?.result?.settleRefused).toBe(2);
  });

  it('records a failed pass as a failed job carrying the message', async () => {
    const deferred = deferredRunner();
    setUpSyncRunnerForTests(deferred.runner);
    const started = startUpSyncJob(db, makeContactsFake(), { accountId, trigger: 'manual' });
    deferred.reject(new Error('Missing secret: set UP_TOKEN_FILE (a file path) or UP_TOKEN'));

    const done = await started.done;
    expect(done.status).toBe('failed');
    expect(done.error).toContain('Missing secret');
    expect(done.result).toBeNull();
  });

  it('hands a second trigger the job already running for the account, and a fresh one after it finishes', async () => {
    const deferred = deferredRunner();
    setUpSyncRunnerForTests(deferred.runner);
    const first = startUpSyncJob(db, makeContactsFake(), { accountId, trigger: 'schedule' });
    const second = startUpSyncJob(db, makeContactsFake(), { accountId, trigger: 'manual' });

    expect(second.reused).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    expect(second.job.trigger).toBe('schedule');
    expect(deferred.calls).toEqual([accountId]);

    deferred.resolve(fakeResult());
    await first.done;
    const third = startUpSyncJob(db, makeContactsFake(), { accountId, trigger: 'manual' });
    expect(third.reused).toBe(false);
    expect(third.job.id).not.toBe(first.job.id);
    deferred.resolve(fakeResult());
    await third.done;
  });

  it('keeps different accounts independent', () => {
    const other = createAccount(db, { name: 'Up Saver', kind: 'savings', currency: 'AUD' }).id;
    const deferred = deferredRunner();
    setUpSyncRunnerForTests(deferred.runner);
    const a = startUpSyncJob(db, makeContactsFake(), { accountId, trigger: 'schedule' });
    const b = startUpSyncJob(db, makeContactsFake(), { accountId: other, trigger: 'schedule' });
    expect(b.reused).toBe(false);
    expect(b.job.id).not.toBe(a.job.id);
    expect(deferred.calls).toEqual([accountId, other]);
  });

  it('answers null for a job it never had', () => {
    expect(getUpSyncJob('nope')).toBeNull();
  });
});
