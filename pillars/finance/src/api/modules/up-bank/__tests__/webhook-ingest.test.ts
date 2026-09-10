/**
 * The Up webhook ingest (POPS-2920, redirected by POPS-3333): every delivery
 * lands in the account's pending draft, classified, and nothing reaches the
 * ledger. Settlements and deletions of staged rows change the draft in
 * place; settlements of rows already in the ledger still settle them there.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { importBatches, transactions } from '../../../../db/schema.js';
import { upsertImportConfig } from '../../../../db/services/account-import-config.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { claimImportDraft, listImportDrafts } from '../../../../db/services/import-drafts.js';
import { insertImportTransaction } from '../../../../db/services/imports.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';
import { readLiveDraftPayload } from '../../import-drafts/live-draft.js';
import { upChecksum } from '../map-transaction.js';
import { syncUpAccount } from '../sync.js';
import { UpBankApiError, type UpBankClient, type UpTransaction } from '../up-api.js';
import { makeUpWebhookIngest, type UpWebhookIngest } from '../webhook-ingest.js';
import { upAccount, upTransaction } from './fixtures.js';

import type { FinanceDb } from '../../../../db/services/internal.js';

let db: FinanceDb;
let accountId: string;

function customer(rows: UpTransaction[]): { client: UpBankClient; asked: string[] } {
  const asked: string[] = [];
  const account = upAccount();
  return {
    asked,
    client: {
      ping: async () => ({ customerId: 'cust-1' }),
      listAccounts: async () => [account],
      getAccount: async () => account,
      getTransaction: async (id) => {
        asked.push(id);
        const found = rows.find((row) => row.id === id);
        if (!found) throw new UpBankApiError(404, `/transactions/${id}`);
        return found;
      },
      listTransactions: async () => rows,
    },
  };
}

function configure(
  forAccount: string,
  externalAccountRef = 'up-acc-1',
  secretRef = 'UP_TOKEN'
): void {
  upsertImportConfig(db, {
    accountId: forAccount,
    sourceKind: 'api',
    provider: 'up',
    externalAccountRef,
    secretRef,
  });
}

function ingestWith(clients: Record<string, UpBankClient>): UpWebhookIngest {
  return makeUpWebhookIngest(db, makeContactsFake(), {
    clientFor: (secretRef) => {
      const client = clients[secretRef];
      if (!client) throw new Error(`no client for ${secretRef}`);
      return client;
    },
  });
}

function storedRows() {
  return db.select().from(transactions).where(eq(transactions.accountId, accountId)).all();
}

function batches() {
  return db.select().from(importBatches).all();
}

function drafts() {
  return listImportDrafts(db, { accountId });
}

function stagedRows() {
  return drafts().flatMap((draft) => readLiveDraftPayload(draft).parsedTransactions);
}

function heldInLedger(upId: string, amountCents: number): string {
  return insertImportTransaction(db, {
    description: 'Fuel',
    dialectAccountLabel: 'Up Everyday',
    accountId,
    amountCents,
    date: '2026-09-05',
    type: 'purchase',
    tags: [],
    entityId: null,
    entityName: null,
    location: null,
    pending: true,
    checksum: upChecksum(accountId, upId),
  }).id;
}

const created = { eventType: 'TRANSACTION_CREATED', transactionId: 'txn-1' };
const settledEvent = { eventType: 'TRANSACTION_SETTLED', transactionId: 'txn-1' };
const deletedEvent = { eventType: 'TRANSACTION_DELETED', transactionId: 'txn-1' };

beforeEach(() => {
  ({ db } = freshMigratedFinanceDb());
  accountId = createAccount(db, { name: 'Up Everyday', kind: 'savings', currency: 'AUD' }).id;
});

describe('makeUpWebhookIngest', () => {
  it('stages a created transaction in one live draft, classified, with the balance; a redelivery changes nothing', async () => {
    configure(accountId);
    const { client } = customer([
      upTransaction({ id: 'txn-1', cents: -1_250, createdAt: '2026-09-05T09:00:00+10:00' }),
    ]);
    const ingest = ingestWith({ UP_TOKEN: client });

    const first = await ingest(created);
    expect(first).toMatchObject({ kind: 'staged', accountId, created: true });
    expect(storedRows()).toEqual([]);
    expect(batches()).toEqual([]);
    const [draft] = drafts();
    expect(draft).toMatchObject({
      id: first.kind === 'staged' ? first.draftId : '',
      state: 'live',
      rowCount: 1,
      unresolvedCount: 1,
      dateFrom: '2026-09-05',
      balanceReportedCents: 48_800,
    });
    const payload = readLiveDraftPayload(draft!);
    expect(payload.parsedTransactions.map((t) => [t.date, t.amount])).toEqual([
      ['2026-09-05', -12.5],
    ]);
    expect(payload.processedForFingerprint).toBe(payload.parsedTransactionsFingerprint);
    expect(payload.processedTransactions.uncertain).toHaveLength(1);

    const second = await ingest(created);
    expect(second).toEqual({ kind: 'already-staged', accountId });
    expect(drafts()).toHaveLength(1);
    expect(stagedRows()).toHaveLength(1);
  });

  it('records the AI diagnostic on the draft when a row could not be classified with AI off', async () => {
    configure(accountId);
    const { client } = customer([
      upTransaction({ id: 'txn-1', description: 'ZZ UNKNOWN MERCHANT' }),
    ]);
    await ingestWith({ UP_TOKEN: client })(created);

    const [draft] = drafts();
    expect(readLiveDraftPayload(draft!).processedTransactions.warnings).toEqual([
      expect.objectContaining({ type: 'AI_CATEGORIZATION_UNAVAILABLE' }),
    ]);
  });

  it('two deliveries in flight together for one transaction stage one row', async () => {
    configure(accountId);
    const { client } = customer([
      upTransaction({ id: 'txn-1', cents: -1_250, createdAt: '2026-09-05T09:00:00+10:00' }),
    ]);
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: UpBankClient = {
      ...client,
      getTransaction: async (id) => {
        await gate;
        return client.getTransaction(id);
      },
    };
    const ingest = ingestWith({ UP_TOKEN: slow });

    const first = ingest(created);
    const second = ingest(settledEvent);
    release();

    expect((await first).kind).toBe('staged');
    expect((await second).kind).toBe('already-staged');
    expect(stagedRows()).toHaveLength(1);
    expect(drafts()).toHaveLength(1);
  });

  it('a failed delivery does not block the next one for the same transaction', async () => {
    configure(accountId);
    const { client } = customer([
      upTransaction({ id: 'txn-1', cents: -1_250, createdAt: '2026-09-05T09:00:00+10:00' }),
    ]);
    let calls = 0;
    const flaky: UpBankClient = {
      ...client,
      getTransaction: async (id) => {
        calls += 1;
        if (calls === 1) throw new UpBankApiError(500, `/transactions/${id}`);
        return client.getTransaction(id);
      },
    };
    const ingest = ingestWith({ UP_TOKEN: flaky });

    const first = ingest(created);
    const second = ingest(created);
    await expect(first).rejects.toBeInstanceOf(UpBankApiError);
    expect((await second).kind).toBe('staged');
    expect(stagedRows()).toHaveLength(1);
  });

  it('a second arrival grows the same draft; one that arrives while it is open goes to a new draft', async () => {
    configure(accountId);
    const rows = [
      upTransaction({ id: 'txn-1', cents: -100, createdAt: '2026-09-05T09:00:00+10:00' }),
      upTransaction({ id: 'txn-2', cents: -200, createdAt: '2026-09-05T10:00:00+10:00' }),
      upTransaction({ id: 'txn-3', cents: -300, createdAt: '2026-09-05T11:00:00+10:00' }),
    ];
    const ingest = ingestWith({ UP_TOKEN: customer(rows).client });

    const first = await ingest(created);
    const second = await ingest({ ...created, transactionId: 'txn-2' });
    expect(second).toMatchObject({ kind: 'staged', created: false });
    expect(drafts()).toHaveLength(1);
    expect(drafts()[0]).toMatchObject({ rowCount: 2, unresolvedCount: 2 });

    claimImportDraft(db, first.kind === 'staged' ? first.draftId : '', 'tab-a');
    const third = await ingest({ ...created, transactionId: 'txn-3' });
    expect(third).toMatchObject({ kind: 'staged', created: true });
    const byState = new Map(drafts().map((d) => [d.state, d]));
    expect(byState.get('saved')).toMatchObject({ rowCount: 2 });
    expect(byState.get('live')).toMatchObject({ rowCount: 1 });
  });

  it('settles a staged row in place on TRANSACTION_SETTLED, and leaves it alone while its draft is open', async () => {
    configure(accountId);
    const held = upTransaction({
      id: 'txn-1',
      status: 'HELD',
      cents: -1_000,
      createdAt: '2026-09-05T09:00:00+10:00',
    });
    const first = await ingestWith({ UP_TOKEN: customer([held]).client })(created);
    expect(stagedRows().map((r) => r.pending)).toEqual([true]);

    const settled = upTransaction({
      id: 'txn-1',
      status: 'SETTLED',
      cents: -1_050,
      createdAt: '2026-09-05T09:00:00+10:00',
      settledAt: '2026-09-07T02:00:00+10:00',
    });
    const ingest = ingestWith({ UP_TOKEN: customer([settled]).client });
    const outcome = await ingest(settledEvent);
    expect(outcome).toEqual({
      kind: 'staged-settled',
      accountId,
      draftId: first.kind === 'staged' ? first.draftId : '',
    });
    const [row] = stagedRows();
    expect(row).toMatchObject({ pending: false, amount: -10.5, date: '2026-09-07' });
    const [draft] = drafts();
    expect(readLiveDraftPayload(draft!).processedTransactions.uncertain[0]).toMatchObject({
      pending: false,
      amount: -10.5,
    });
    expect(draft).toMatchObject({ dateFrom: '2026-09-07', rowCount: 1 });
    expect(storedRows()).toEqual([]);

    claimImportDraft(db, draft!.id, 'tab-a');
    const again = upTransaction({ ...settled, id: 'txn-1' });
    await expect(ingestWith({ UP_TOKEN: customer([again]).client })(settledEvent)).resolves.toEqual(
      {
        kind: 'already-staged',
        accountId,
      }
    );
  });

  it('settles a held row already in the ledger, once, and refuses the sign the guard refuses', async () => {
    configure(accountId);
    const id = heldInLedger('txn-1', -1_000);
    const settled = upTransaction({
      id: 'txn-1',
      status: 'SETTLED',
      cents: -1_050,
      createdAt: '2026-09-05T09:00:00+10:00',
      settledAt: '2026-09-07T02:00:00+10:00',
    });
    const ingest = ingestWith({ UP_TOKEN: customer([settled]).client });

    await expect(ingest(settledEvent)).resolves.toEqual({
      kind: 'settled',
      accountId,
      transactionId: id,
    });
    expect(storedRows()[0]).toMatchObject({
      pending: false,
      amountCents: -1_050,
      date: '2026-09-07',
    });
    await expect(ingest(settledEvent)).resolves.toEqual({ kind: 'duplicate', accountId });
    expect(drafts()).toEqual([]);

    const other = heldInLedger('txn-2', -1_000);
    const positive = upTransaction({
      id: 'txn-2',
      status: 'SETTLED',
      cents: 1_000,
      createdAt: '2026-09-05T09:00:00+10:00',
      settledAt: '2026-09-07T02:00:00+10:00',
    });
    await expect(
      ingestWith({ UP_TOKEN: customer([positive]).client })({
        ...settledEvent,
        transactionId: 'txn-2',
      })
    ).resolves.toEqual({ kind: 'settle-refused', accountId, transactionId: other });
  });

  it('drops a staged row on TRANSACTION_DELETED and discards the draft when that was its last row', async () => {
    configure(accountId);
    const rows = [upTransaction({ id: 'txn-1' }), upTransaction({ id: 'txn-2', cents: -5 })];
    const ingest = ingestWith({ UP_TOKEN: customer(rows).client });
    await ingest(created);
    await ingest({ ...created, transactionId: 'txn-2' });

    await expect(ingest(deletedEvent)).resolves.toEqual({
      kind: 'deleted',
      transactionId: 'txn-1',
      staged: true,
    });
    expect(stagedRows().map((r) => r.amount)).toEqual([-0.05]);
    expect(drafts()[0]).toMatchObject({ rowCount: 1 });

    await expect(ingest({ ...deletedEvent, transactionId: 'txn-2' })).resolves.toMatchObject({
      staged: true,
    });
    expect(drafts()).toEqual([]);

    await expect(ingest(deletedEvent)).resolves.toEqual({
      kind: 'deleted',
      transactionId: 'txn-1',
      staged: false,
    });
  });

  it('is one staged row with the batch sync, whichever fetches it first', async () => {
    configure(accountId);
    const { client } = customer([
      upTransaction({ id: 'txn-1', cents: -900, createdAt: '2026-09-03T09:00:00+10:00' }),
    ]);
    await ingestWith({ UP_TOKEN: client })(created);

    const sync = await syncUpAccount(db, makeContactsFake(), {
      accountId,
      client,
      from: '2026-09-01',
      to: '2026-09-05',
      asOf: '2026-09-06',
    });
    expect(sync).toMatchObject({ fetched: 1, staged: 0, alreadyStaged: 1, settled: 0 });
    expect(stagedRows()).toHaveLength(1);
    expect(drafts()).toHaveLength(1);
  });

  it('reports an Up account nobody has mapped and writes nothing', async () => {
    const other = createAccount(db, { name: 'Up Saver', kind: 'savings', currency: 'AUD' }).id;
    configure(other, 'up-acc-2');
    const { client } = customer([upTransaction({ id: 'txn-1' })]);

    await expect(ingestWith({ UP_TOKEN: client })(created)).resolves.toEqual({
      kind: 'unmapped',
      upAccountId: 'up-acc-1',
      transactionId: 'txn-1',
    });
    expect(db.select().from(transactions).all()).toHaveLength(0);
    expect(listImportDrafts(db)).toEqual([]);
  });

  it('ignores events it does not ingest, events without a transaction, and a ledger with no Up secret', async () => {
    const { client } = customer([upTransaction({ id: 'txn-1' })]);
    const ingest = ingestWith({ UP_TOKEN: client });

    await expect(ingest({ eventType: 'PING', transactionId: undefined })).resolves.toMatchObject({
      kind: 'ignored',
      reason: 'no transaction id',
    });
    await expect(ingest({ eventType: 'PING', transactionId: 'x' })).resolves.toMatchObject({
      kind: 'ignored',
      reason: 'event PING is not ingested',
    });
    await expect(ingest(created)).resolves.toMatchObject({
      kind: 'ignored',
      reason: 'no account fed by Up names a secret',
    });
  });

  it('tries each configured secret until one knows the transaction, and gives up when none does', async () => {
    const other = createAccount(db, {
      name: 'Up Other Customer',
      kind: 'savings',
      currency: 'AUD',
    }).id;
    configure(other, 'up-acc-other', 'UP_TOKEN_A');
    configure(accountId, 'up-acc-1', 'UP_TOKEN_B');
    const a = customer([]);
    const b = customer([upTransaction({ id: 'txn-1', cents: -300 })]);
    const ingest = ingestWith({ UP_TOKEN_A: a.client, UP_TOKEN_B: b.client });

    await expect(ingest(created)).resolves.toMatchObject({ kind: 'staged', accountId });
    expect(b.asked).toEqual(['txn-1']);

    await expect(ingest({ ...created, transactionId: 'txn-nobody' })).resolves.toEqual({
      kind: 'ignored',
      reason: 'transaction txn-nobody not found under any token',
    });
    expect(a.asked).toContain('txn-nobody');
    expect(b.asked).toContain('txn-nobody');
  });

  it('surfaces an Up error other than 404 instead of treating it as not found', async () => {
    configure(accountId);
    const { client } = customer([]);
    client.getTransaction = async () => {
      throw new UpBankApiError(500, '/transactions/txn-1');
    };
    await expect(ingestWith({ UP_TOKEN: client })(created)).rejects.toBeInstanceOf(UpBankApiError);
  });
});
