/**
 * Import status derivation against the migrated schema (POPS-2917, finance ADR-003):
 * cadence from batch gaps, the span from every transaction rather than the
 * last batch, and which source a status names.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { markSynced, upsertImportConfig } from '../services/account-import-config.js';
import { createAccount } from '../services/accounts.js';
import { insertBatch } from '../services/import-batches.js';
import { cadenceDaysOf, importStatusFor } from '../services/import-status.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type Database from 'better-sqlite3';

import type { InsertBatchInput } from '../services/import-batches.js';
import type { FinanceDb } from '../services/internal.js';

let db: FinanceDb;
let raw: Database.Database;
let accountId: string;

beforeEach(() => {
  ({ db, raw } = freshMigratedFinanceDb());
  accountId = createAccount(db, { name: 'Everyday', kind: 'checking', currency: 'AUD' }).id;
});

function seedTransaction(date: string, forAccount = accountId): void {
  raw
    .prepare(
      `INSERT INTO transactions (id, description, account_id, amount_cents, date, type, last_edited_time)
       VALUES (?, 'row', ?, -100, ?, 'purchase', '2026-09-06T00:00:00.000Z')`
    )
    .run(crypto.randomUUID(), forAccount, date);
}

function batchAt(
  createdAt: string,
  overrides: Partial<InsertBatchInput> = {},
  forAccount = accountId
): string {
  const row = insertBatch(
    db,
    { accountId: forAccount, sourceKind: 'csv-dialect', rowCount: 0, ...overrides },
    []
  );
  raw.prepare('UPDATE import_batches SET created_at = ? WHERE id = ?').run(createdAt, row.id);
  return row.id;
}

function statusOf(id = accountId) {
  const status = importStatusFor(db, [id]).get(id);
  if (status === undefined) throw new Error(`no status for ${id}`);
  return status;
}

describe('cadenceDaysOf', () => {
  it('is null under three batches', () => {
    expect(cadenceDaysOf([])).toBeNull();
    expect(cadenceDaysOf(['2026-09-01T00:00:00.000Z'])).toBeNull();
    expect(cadenceDaysOf(['2026-09-08T00:00:00.000Z', '2026-09-01T00:00:00.000Z'])).toBeNull();
  });

  it('is the median gap, not the mean, so one long silence does not move it', () => {
    expect(
      cadenceDaysOf([
        '2026-09-15T00:00:00.000Z',
        '2026-09-08T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        '2026-05-01T00:00:00.000Z',
      ])
    ).toBe(7);
  });

  it('averages the two middle gaps when the gap count is even, and rounds to whole days', () => {
    expect(
      cadenceDaysOf([
        '2026-09-13T00:00:00.000Z',
        '2026-09-10T00:00:00.000Z',
        '2026-09-05T00:00:00.000Z',
      ])
    ).toBe(4);
  });
});

describe('importStatusFor', () => {
  it('answers with every field null for an account never imported into, and nothing for no accounts', () => {
    expect(statusOf()).toEqual({
      lastImportAt: null,
      lastSyncedAt: null,
      lastBatchId: null,
      newestTransactionDate: null,
      span: null,
      cadenceDays: null,
      source: null,
    });
    expect(importStatusFor(db, []).size).toBe(0);
  });

  it('names the newest batch and derives cadence from the last five only', () => {
    batchAt('2026-01-01T00:00:00.000Z');
    batchAt('2026-03-01T00:00:00.000Z');
    const stamps = [
      '2026-08-01T00:00:00.000Z',
      '2026-08-08T00:00:00.000Z',
      '2026-08-15T00:00:00.000Z',
      '2026-08-22T00:00:00.000Z',
      '2026-08-29T00:00:00.000Z',
    ];
    const ids = stamps.map((at) => batchAt(at));

    const status = statusOf();

    expect(status.lastBatchId).toBe(ids[4]);
    expect(status.lastImportAt).toBe('2026-08-29T00:00:00.000Z');
    expect(status.cadenceDays).toBe(7);
  });

  it('is null cadence with one batch and with two, and a median with three', () => {
    batchAt('2026-08-01T00:00:00.000Z');
    expect(statusOf().cadenceDays).toBeNull();
    batchAt('2026-08-11T00:00:00.000Z');
    expect(statusOf().cadenceDays).toBeNull();
    batchAt('2026-08-31T00:00:00.000Z');
    expect(statusOf().cadenceDays).toBe(15);
  });

  it('spans every transaction on the account, including a manual row older than any batch', () => {
    seedTransaction('2024-11-30');
    seedTransaction('2026-07-15');
    batchAt('2026-08-01T00:00:00.000Z', { dateFrom: '2026-07-01', dateTo: '2026-07-15' });

    const status = statusOf();

    expect(status.span).toEqual({ from: '2024-11-30', to: '2026-07-15' });
    expect(status.newestTransactionDate).toBe('2026-07-15');
  });

  it('reads the source off the newest batch by kind when there is no config', () => {
    batchAt('2026-08-01T00:00:00.000Z', { sourceKind: 'csv-dialect', sourceRef: 'ING' });
    expect(statusOf().source).toEqual({ kind: 'csv-dialect', dialectId: 'ING' });

    batchAt('2026-08-02T00:00:00.000Z', {
      sourceKind: 'pdf-statement',
      sourceRef: 'anz-pdf-statement',
    });
    expect(statusOf().source).toEqual({ kind: 'pdf-statement', parserId: 'anz-pdf-statement' });

    batchAt('2026-08-03T00:00:00.000Z', { sourceKind: 'api', sourceRef: 'up' });
    expect(statusOf().source).toEqual({ kind: 'api', provider: 'up' });
  });

  it('drops a provider ref no client exists for rather than serving an unknown enum member', () => {
    batchAt('2026-08-03T00:00:00.000Z', { sourceKind: 'api', sourceRef: 'nab-experimental' });
    expect(statusOf().source).toEqual({ kind: 'api' });
  });

  it('prefers the configured source over what the newest batch says', () => {
    batchAt('2026-08-01T00:00:00.000Z', { sourceKind: 'csv-dialect', sourceRef: 'ING' });
    upsertImportConfig(db, {
      accountId,
      sourceKind: 'api',
      provider: 'up',
      externalAccountRef: 'up-acc-1',
    });

    expect(statusOf().source).toEqual({ kind: 'api', provider: 'up' });
  });

  it('keeps accounts apart when resolving a set', () => {
    const other = createAccount(db, { name: 'Card', kind: 'credit-card', currency: 'AUD' }).id;
    seedTransaction('2026-01-05');
    seedTransaction('2026-06-01', other);
    batchAt('2026-08-01T00:00:00.000Z', {}, other);

    const statuses = importStatusFor(db, [accountId, other]);

    expect(statuses.get(accountId)).toMatchObject({
      lastBatchId: null,
      span: { from: '2026-01-05', to: '2026-01-05' },
    });
    expect(statuses.get(other)).toMatchObject({
      lastImportAt: '2026-08-01T00:00:00.000Z',
      span: { from: '2026-06-01', to: '2026-06-01' },
    });
  });
});

describe('lastSyncedAt', () => {
  it('is null with no config and with a config never synced', () => {
    expect(statusOf().lastSyncedAt).toBeNull();
    upsertImportConfig(db, { accountId, sourceKind: 'api', provider: 'up' });
    expect(statusOf()).toMatchObject({ lastSyncedAt: null, lastImportAt: null });
  });

  it('moves lastImportAt when the last pass is newer than the newest batch, and not when it is older', () => {
    upsertImportConfig(db, { accountId, sourceKind: 'api', provider: 'up' });
    batchAt('2026-09-01T00:00:00.000Z');
    markSynced(db, accountId, new Date('2026-09-05T00:00:00.000Z'));
    expect(statusOf()).toMatchObject({
      lastSyncedAt: '2026-09-05T00:00:00.000Z',
      lastImportAt: '2026-09-05T00:00:00.000Z',
    });

    batchAt('2026-09-08T00:00:00.000Z');
    expect(statusOf()).toMatchObject({
      lastSyncedAt: '2026-09-05T00:00:00.000Z',
      lastImportAt: '2026-09-08T00:00:00.000Z',
    });
  });

  it('a pass that found nothing still counts as being fed', () => {
    upsertImportConfig(db, { accountId, sourceKind: 'api', provider: 'up' });
    markSynced(db, accountId, new Date('2026-09-05T00:00:00.000Z'));
    expect(statusOf()).toMatchObject({
      lastBatchId: null,
      lastImportAt: '2026-09-05T00:00:00.000Z',
    });
  });
});
