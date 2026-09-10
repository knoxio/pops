import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The scheduled Up sync (POPS-2921): governed by settings read every pass,
 * one job per Up-fed account, a missing secret fails that account alone,
 * overlapping triggers share a job, and a stop waits for the pass in flight
 * without touching the flag.
 */
import { setBulk } from '@pops/pillar-settings/service';

import { freshMigratedFinanceDb } from '../../../db/__tests__/migrated-db.js';
import { upsertImportConfig } from '../../../db/services/account-import-config.js';
import { createAccount } from '../../../db/services/accounts.js';
import { makeContactsFake } from '../../__tests__/contacts-fake.js';
import {
  clearUpSyncJobs,
  setUpSyncRunnerForTests,
  startUpSyncJob,
  type UpSyncRunner,
} from '../../modules/up-bank/sync-jobs.js';
import { syncUpAccount, type UpSyncResult } from '../../modules/up-bank/sync.js';
import { readUpSyncSettings, startUpSyncScheduler } from '../up-sync-scheduler.js';

import type { FinanceDb } from '../../../db/services/internal.js';

let db: FinanceDb;

function upAccountRow(name: string, secretRef = 'UP_TOKEN_FOR_TESTS'): string {
  const id = createAccount(db, { name, kind: 'savings', currency: 'AUD' }).id;
  upsertImportConfig(db, {
    accountId: id,
    sourceKind: 'api',
    provider: 'up',
    externalAccountRef: `up-${id}`,
    secretRef,
  });
  return id;
}

function enable(intervalMinutes = 60): void {
  setBulk(db, [
    { key: 'finance.upSync.enabled', value: 'true' },
    { key: 'finance.upSync.intervalMinutes', value: String(intervalMinutes) },
  ]);
}

function result(accountId: string): UpSyncResult {
  return {
    accountId,
    fetched: 1,
    staged: 1,
    alreadyStaged: 0,
    alreadyInLedger: 0,
    settled: 0,
    settleRefused: 0,
    alreadyHeld: 0,
    draftId: `draft-${accountId}`,
    warnings: [],
  };
}

function recordingRunner() {
  const calls: string[] = [];
  const runner: UpSyncRunner = async (_db, _contacts, args) => {
    calls.push(args.accountId);
    return result(args.accountId);
  };
  return { runner, calls };
}

function logger() {
  return { info: vi.fn(), warn: vi.fn() };
}

beforeEach(() => {
  ({ db } = freshMigratedFinanceDb());
});

afterEach(() => {
  setUpSyncRunnerForTests(null);
  clearUpSyncJobs();
});

describe('readUpSyncSettings', () => {
  it('is off every six hours until told otherwise', () => {
    expect(readUpSyncSettings(db)).toEqual({ enabled: false, intervalMs: 6 * 60 * 60 * 1000 });
  });

  it('reads the stored flag and interval', () => {
    enable(15);
    expect(readUpSyncSettings(db)).toEqual({ enabled: true, intervalMs: 15 * 60 * 1000 });
  });

  it('falls back to the default interval when the stored one is not a positive number', () => {
    setBulk(db, [{ key: 'finance.upSync.intervalMinutes', value: 'soon' }]);
    expect(readUpSyncSettings(db).intervalMs).toBe(6 * 60 * 60 * 1000);
    setBulk(db, [{ key: 'finance.upSync.intervalMinutes', value: '0' }]);
    expect(readUpSyncSettings(db).intervalMs).toBe(6 * 60 * 60 * 1000);
  });
});

describe('startUpSyncScheduler', () => {
  it('does nothing while the flag is off', async () => {
    upAccountRow('Up Everyday');
    const { runner, calls } = recordingRunner();
    setUpSyncRunnerForTests(runner);
    const handle = startUpSyncScheduler({
      db,
      contacts: makeContactsFake(),
      disabledPollMs: 60_000,
    });

    await expect(handle.runOnce()).resolves.toEqual({
      enabled: false,
      accounts: 0,
      synced: 0,
      failed: 0,
    });
    expect(calls).toEqual([]);
    await handle.stop();
  });

  it('runs one job per Up-fed account, in account order, and leaves file-fed accounts alone', async () => {
    const b = upAccountRow('Up Saver');
    const a = upAccountRow('Up Everyday');
    const csv = createAccount(db, { name: 'ANZ', kind: 'checking', currency: 'AUD' }).id;
    upsertImportConfig(db, { accountId: csv, sourceKind: 'csv-dialect', dialectId: 'ANZ' });
    enable();
    const { runner, calls } = recordingRunner();
    setUpSyncRunnerForTests(runner);
    const log = logger();
    const handle = startUpSyncScheduler({
      db,
      contacts: makeContactsFake(),
      logger: log,
      disabledPollMs: 60_000,
    });

    await expect(handle.runOnce()).resolves.toEqual({
      enabled: true,
      accounts: 2,
      synced: 2,
      failed: 0,
    });
    expect(calls).toEqual([a, b].toSorted());
    expect(log.warn).not.toHaveBeenCalled();
    await handle.stop();
  });

  it('fails the account whose secret is missing, warns once for it, and still syncs the others', async () => {
    const missing = upAccountRow('Up No Token', 'UP_TOKEN_THAT_NOBODY_SET');
    const fine = upAccountRow('Up Everyday');
    enable();
    const { runner, calls } = recordingRunner();
    setUpSyncRunnerForTests((runDb, contacts, args) =>
      args.accountId === missing
        ? syncUpAccount(runDb, contacts, args)
        : runner(runDb, contacts, args)
    );
    const log = logger();
    const handle = startUpSyncScheduler({
      db,
      contacts: makeContactsFake(),
      logger: log,
      disabledPollMs: 60_000,
    });

    await expect(handle.runOnce()).resolves.toEqual({
      enabled: true,
      accounts: 2,
      synced: 1,
      failed: 1,
    });
    expect(calls).toEqual([fine]);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      'finance up sync skipped',
      expect.objectContaining({
        accountId: missing,
        error: expect.stringContaining('UP_TOKEN_THAT_NOBODY_SET'),
      })
    );
    await handle.stop();
  });

  it('hands a manual trigger during a scheduled pass the pass’s own job', async () => {
    const id = upAccountRow('Up Everyday');
    enable();
    let release: (r: UpSyncResult) => void = () => {};
    const gate = new Promise<UpSyncResult>((res) => {
      release = res;
    });
    let started: () => void = () => {};
    const begun = new Promise<void>((res) => {
      started = res;
    });
    setUpSyncRunnerForTests(() => {
      started();
      return gate;
    });
    const handle = startUpSyncScheduler({
      db,
      contacts: makeContactsFake(),
      disabledPollMs: 60_000,
    });

    const pass = handle.runOnce();
    await begun;
    const manual = startUpSyncJob(db, makeContactsFake(), { accountId: id, trigger: 'manual' });
    expect(manual.reused).toBe(true);
    expect(manual.job.trigger).toBe('schedule');

    release(result(id));
    await expect(pass).resolves.toMatchObject({ synced: 1 });
    await expect(manual.done).resolves.toMatchObject({ id: manual.job.id, status: 'completed' });
    await handle.stop();
  });

  it('stop waits for the pass in flight and leaves the schedule enabled', async () => {
    const id = upAccountRow('Up Everyday');
    enable();
    let release: (r: UpSyncResult) => void = () => {};
    const gate = new Promise<UpSyncResult>((res) => {
      release = res;
    });
    let started: () => void = () => {};
    const begun = new Promise<void>((res) => {
      started = res;
    });
    let calls = 0;
    setUpSyncRunnerForTests(() => {
      calls += 1;
      started();
      return gate;
    });
    const handle = startUpSyncScheduler({ db, contacts: makeContactsFake(), disabledPollMs: 1 });

    await begun;
    let stopped = false;
    const stopping = handle.stop().then(() => {
      stopped = true;
    });
    await new Promise((res) => setTimeout(res, 10));
    expect(stopped).toBe(false);

    release(result(id));
    await stopping;
    expect(stopped).toBe(true);
    expect(readUpSyncSettings(db).enabled).toBe(true);

    await new Promise((res) => setTimeout(res, 20));
    expect(calls).toBe(1);
  });

  it('keeps looking at a disabled flag on the poll interval', async () => {
    const reads = vi.fn(() => ({ enabled: false, intervalMs: 60_000 }));
    const handle = startUpSyncScheduler({
      db,
      contacts: makeContactsFake(),
      disabledPollMs: 2,
      readSettings: reads,
    });
    try {
      // Waiting for the second read rather than sleeping a fixed 30ms: the
      // assertion is about the scheduler re-reading, not about how fast a
      // loaded box gets round to it. A full-workspace run starves the event
      // loop enough that only one tick lands in 30ms (POPS-3006).
      await vi.waitFor(() => expect(reads.mock.calls.length).toBeGreaterThanOrEqual(2), {
        timeout: 5_000,
        interval: 5,
      });
    } finally {
      await handle.stop();
    }
  });
});
