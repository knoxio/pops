/**
 * The Up sync against the migrated schema (POPS-30): rows land through the
 * commit pipeline, a batch and a checkpoint are recorded, a re-run is a
 * no-op, a held row settles as one row, and the plan writes nothing.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { accountCheckpoints, importBatches, transactions } from '../../../../db/schema.js';
import {
  getImportConfig,
  upsertImportConfig,
} from '../../../../db/services/account-import-config.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { claimImportDraft, listImportDrafts } from '../../../../db/services/import-drafts.js';
import { insertImportTransaction } from '../../../../db/services/imports.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';
import { readLiveDraftPayload } from '../../import-drafts/live-draft.js';
import { upChecksum } from '../map-transaction.js';
import { planUpSync, UpSyncCurrencyMismatchError, UpSyncNotConfiguredError } from '../sync-plan.js';
import { syncUpAccount } from '../sync.js';
import { upAccount, upTransaction } from './fixtures.js';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { UpAccount, UpBankClient, UpTransaction, UpTransactionRange } from '../up-api.js';

let db: FinanceDb;
let accountId: string;

/** In-memory Up: one account, whatever rows the test seeds, and the ranges it was asked for. */
function fakeUp(rows: UpTransaction[], account: UpAccount = upAccount()) {
  const ranges: UpTransactionRange[] = [];
  const client: UpBankClient = {
    ping: async () => ({ customerId: 'cust-1' }),
    listAccounts: async () => [account],
    getAccount: async (id) => {
      if (id !== account.id) throw new Error(`unknown Up account ${id}`);
      return account;
    },
    getTransaction: async (id) => {
      const found = rows.find((row) => row.id === id);
      if (!found) throw new Error(`unknown Up transaction ${id}`);
      return found;
    },
    listTransactions: async (_id, range) => {
      ranges.push(range);
      return rows;
    },
  };
  return { client, ranges };
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

const RANGE = { from: '2026-09-01', to: '2026-09-05', asOf: '2026-09-06' };

function storedRows() {
  return db.select().from(transactions).where(eq(transactions.accountId, accountId)).all();
}

function drafts() {
  return listImportDrafts(db, { accountId });
}

function stagedRows() {
  const [draft] = drafts();
  return draft === undefined ? [] : readLiveDraftPayload(draft).parsedTransactions;
}

/** A held Up row already in the ledger, as an earlier commit would have left it. */
function heldInLedger(upId: string, description: string, amountCents: number, date: string) {
  return insertImportTransaction(db, {
    description,
    dialectAccountLabel: 'Up Everyday',
    accountId,
    amountCents,
    date,
    type: 'purchase',
    tags: [],
    entityId: null,
    entityName: null,
    location: null,
    pending: true,
    checksum: upChecksum(accountId, upId),
  }).id;
}

beforeEach(() => {
  ({ db } = freshMigratedFinanceDb());
  accountId = createAccount(db, { name: 'Up Everyday', kind: 'savings', currency: 'AUD' }).id;
});

describe('syncUpAccount', () => {
  it("stages the range into the account's live draft, classified, with the balance Up reported; nothing reaches the ledger", async () => {
    configure();
    const { client, ranges } = fakeUp([
      upTransaction({ id: 'a', cents: -1_200, createdAt: '2026-09-02T09:00:00+10:00' }),
      upTransaction({
        id: 'b',
        cents: 50_000,
        description: 'Salary',
        transactionType: 'Direct Credit',
        createdAt: '2026-09-04T00:10:00+10:00',
      }),
    ]);
    const syncedAt = new Date('2026-09-06T01:02:03.000Z');

    const result = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client,
      ...RANGE,
      syncedAt,
    });

    expect(ranges).toEqual([{ since: '2026-08-31T00:00:00Z', until: '2026-09-07T00:00:00Z' }]);
    expect(result).toMatchObject({
      accountId,
      fetched: 2,
      staged: 2,
      alreadyStaged: 0,
      alreadyInLedger: 0,
      settled: 0,
      alreadyHeld: 0,
    });
    expect(storedRows()).toEqual([]);
    expect(db.select().from(importBatches).all()).toEqual([]);
    expect(db.select().from(accountCheckpoints).all()).toEqual([]);

    const [draft] = drafts();
    expect(draft).toMatchObject({
      id: result.draftId,
      state: 'live',
      sourceKind: 'live',
      provider: 'up',
      rowCount: 2,
      dateFrom: '2026-09-02',
      dateTo: '2026-09-04',
      balanceReportedCents: 48_800,
      ownerToken: null,
    });
    const payload = readLiveDraftPayload(draft!);
    expect(payload.currentStep).toBe(3);
    expect(payload.processedForFingerprint).toBe(payload.parsedTransactionsFingerprint);
    expect(payload.parsedTransactions.map((t) => [t.date, t.amount, t.pending])).toEqual([
      ['2026-09-02', -12, false],
      ['2026-09-04', 500, false],
    ]);
    const processed = [
      ...payload.processedTransactions.matched,
      ...payload.processedTransactions.uncertain,
    ];
    expect(processed.find((t) => t.description === 'Salary')?.transactionType).toBe('income');
    expect(getImportConfig(db, accountId)?.lastSyncedAt).toBe(syncedAt.toISOString());
  });

  it('a sync with nothing new records the pass and writes no batch and no draft', async () => {
    configure();
    const { client } = fakeUp([]);
    const syncedAt = new Date('2026-09-06T05:00:00.000Z');

    const result = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client,
      ...RANGE,
      syncedAt,
    });

    expect(result).toMatchObject({ fetched: 0, staged: 0, draftId: null });
    expect(drafts()).toEqual([]);
    expect(db.select().from(importBatches).all()).toEqual([]);
    expect(getImportConfig(db, accountId)?.lastSyncedAt).toBe(syncedAt.toISOString());
  });

  it('re-running the same range stages nothing twice and keeps one draft', async () => {
    configure();
    const { client } = fakeUp([upTransaction({ id: 'a' }), upTransaction({ id: 'b', cents: -5 })]);
    const first = await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    const again = await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    expect(again).toMatchObject({
      fetched: 2,
      staged: 0,
      alreadyStaged: 2,
      draftId: first.draftId,
    });
    expect(drafts()).toHaveLength(1);
    expect(stagedRows()).toHaveLength(2);
  });

  it('a row already in the ledger is counted, not staged', async () => {
    configure();
    heldInLedger('a', 'Coles', -1_200, '2026-09-01');
    const { client } = fakeUp([
      upTransaction({
        id: 'a',
        status: 'HELD',
        cents: -1_200,
        createdAt: '2026-09-01T09:00:00+10:00',
      }),
      upTransaction({ id: 'c', cents: -700, createdAt: '2026-09-02T09:00:00+10:00' }),
    ]);

    const result = await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    expect(result).toMatchObject({ fetched: 2, staged: 1, alreadyInLedger: 0, alreadyHeld: 1 });
    expect(stagedRows().map((t) => t.amount)).toEqual([-7]);
  });

  it('Sync now while the live draft is open stages into the next draft, leaving the open one as it was', async () => {
    configure();
    const first = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client: fakeUp([upTransaction({ id: 'a' })]).client,
      ...RANGE,
    });
    claimImportDraft(db, first.draftId ?? '', 'tab-a');

    const next = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client: fakeUp([upTransaction({ id: 'a' }), upTransaction({ id: 'b', cents: -300 })]).client,
      ...RANGE,
    });

    expect(next.staged).toBe(1);
    expect(next.draftId).not.toBe(first.draftId);
    const byId = new Map(drafts().map((d) => [d.id, d]));
    expect(byId.get(first.draftId ?? '')).toMatchObject({ state: 'saved', rowCount: 1 });
    expect(byId.get(next.draftId ?? '')).toMatchObject({ state: 'live', rowCount: 1 });
  });

  it('settles a held ledger row in place: one row, new date and amount, flag cleared, edits untouched', async () => {
    configure();
    const id = heldInLedger('h', 'Fuel', -10_000, '2026-09-01');
    db.update(transactions).set({ notes: 'fuel, keep' }).where(eq(transactions.id, id)).run();
    const held = upTransaction({
      id: 'h',
      status: 'HELD',
      cents: -10_000,
      createdAt: '2026-09-01T18:00:00+10:00',
    });

    const stillHeld = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client: fakeUp([held]).client,
      ...RANGE,
      asOf: '2026-09-07',
    });
    expect(stillHeld).toMatchObject({ staged: 0, settled: 0, alreadyHeld: 1 });

    const settled = upTransaction({
      id: 'h',
      status: 'SETTLED',
      cents: -10_250,
      createdAt: '2026-09-01T18:00:00+10:00',
      settledAt: '2026-09-03T03:00:00+10:00',
    });
    const result = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client: fakeUp([settled]).client,
      ...RANGE,
      asOf: '2026-09-08',
    });

    expect(result).toMatchObject({ staged: 0, settled: 1, alreadyHeld: 0 });
    const rows = storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      pending: false,
      date: '2026-09-03',
      amountCents: -10_250,
      notes: 'fuel, keep',
    });
    expect(JSON.parse(rows[0]?.rawRow ?? '{}')).toMatchObject({ status: 'SETTLED' });
    expect(drafts()).toEqual([]);
  });

  it('reports a refused settlement without abandoning the rest of the pass', async () => {
    configure();
    heldInLedger('p', 'Fuel', -10_000, '2026-09-01');
    heldInLedger('q', 'Coffee', -2_000, '2026-09-01');

    // Up settles the held authorisation at the opposite sign: a positive
    // amount on a row typed `purchase`, which is the pairing the guard refuses.
    const settledPositive = upTransaction({
      id: 'p',
      description: 'Fuel',
      status: 'SETTLED',
      cents: 10_000,
      createdAt: '2026-09-01T18:00:00+10:00',
      settledAt: '2026-09-03T03:00:00+10:00',
    });
    const settledCoffee = upTransaction({
      id: 'q',
      description: 'Coffee',
      status: 'SETTLED',
      cents: -2_100,
      createdAt: '2026-09-01T19:00:00+10:00',
      settledAt: '2026-09-03T04:00:00+10:00',
    });

    const result = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client: fakeUp([settledPositive, settledCoffee]).client,
      ...RANGE,
      asOf: '2026-09-08',
    });

    expect(result).toMatchObject({ staged: 0, settled: 1, settleRefused: 1, alreadyHeld: 0 });
    const byDescription = new Map(storedRows().map((r) => [r.description, r]));
    expect(byDescription.get('Fuel')).toMatchObject({
      pending: true,
      amountCents: -10_000,
      date: '2026-09-01',
    });
    expect(byDescription.get('Coffee')).toMatchObject({
      pending: false,
      amountCents: -2_100,
      date: '2026-09-03',
    });
  });

  it('keeps rows outside the requested calendar range, even though the fetch is wider', async () => {
    configure();
    const { client } = fakeUp([
      upTransaction({ id: 'before', createdAt: '2026-08-31T23:00:00+10:00' }),
      upTransaction({ id: 'in', createdAt: '2026-09-05T23:00:00+10:00' }),
      upTransaction({ id: 'after', createdAt: '2026-09-06T00:30:00+10:00' }),
    ]);

    const result = await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    expect(result).toMatchObject({ fetched: 3, staged: 1 });
    expect(stagedRows().map((r) => r.date)).toEqual(['2026-09-05']);
  });

  it("asserts the mapper's transfer type over the ladder's guess on the staged row", async () => {
    configure();
    const { client } = fakeUp([
      upTransaction({ id: 't', cents: -20_000, transferAccountId: 'up-acc-2' }),
    ]);

    await syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE });

    const [draft] = drafts();
    const { matched, uncertain, failed } = readLiveDraftPayload(draft!).processedTransactions;
    expect([...matched, ...uncertain, ...failed].map((t) => t.transactionType)).toEqual([
      'transfer',
    ]);
  });

  it('refuses an account with no Up config, and one whose Up account holds another currency', async () => {
    const { client } = fakeUp([]);
    await expect(
      syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE })
    ).rejects.toBeInstanceOf(UpSyncNotConfiguredError);

    upsertImportConfig(db, { accountId, sourceKind: 'csv-dialect', dialectId: 'ING' });
    await expect(
      syncUpAccount(db, makeContactsFake(), { accountId, client, ...RANGE })
    ).rejects.toMatchObject({ name: 'UpSyncNotConfiguredError', reason: 'provider is none' });

    configure();
    const usd = fakeUp(
      [],
      upAccount({ balance: { currencyCode: 'USD', value: '1.00', valueInBaseUnits: 100 } })
    );
    await expect(
      syncUpAccount(db, makeContactsFake(), { accountId, client: usd.client, ...RANGE })
    ).rejects.toBeInstanceOf(UpSyncCurrencyMismatchError);
    expect(drafts()).toEqual([]);
    expect(getImportConfig(db, accountId)?.lastSyncedAt).toBeNull();
  });

  it('needs the token only when no client is injected', async () => {
    upsertImportConfig(db, {
      accountId,
      sourceKind: 'api',
      provider: 'up',
      externalAccountRef: 'up-acc-1',
    });
    await expect(planUpSync(db, { accountId, ...RANGE })).rejects.toMatchObject({
      name: 'UpSyncNotConfiguredError',
      reason: 'no secret name',
    });
  });
});

describe('planUpSync', () => {
  it('reports what a sync would do without writing a row, a batch or a checkpoint', async () => {
    configure();
    const { client } = fakeUp([upTransaction({ id: 'a' }), upTransaction({ id: 'b', cents: 7 })]);

    const plan = await planUpSync(db, { accountId, client, ...RANGE });

    expect(plan.newRows.map((r) => r.parsed.checksum)).toHaveLength(2);
    expect(plan).toMatchObject({ fetched: 2, settleable: [], alreadyHeld: 0 });
    expect(plan.account).toMatchObject({ id: accountId, kind: 'savings', currency: 'AUD' });
    expect(storedRows()).toEqual([]);
    expect(db.select().from(importBatches).all()).toEqual([]);
    expect(db.select().from(accountCheckpoints).all()).toEqual([]);
  });
});
