/**
 * The live draft's own rules (POPS-3333): dedup against the draft and the
 * ledger, the open draft that is never written to, settle and drop in place.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { createAccount } from '../../../../db/services/accounts.js';
import {
  claimImportDraft,
  getImportDraft,
  listImportDrafts,
} from '../../../../db/services/import-drafts.js';
import { insertImportTransaction } from '../../../../db/services/imports.js';
import { makeContactsFake } from '../../../__tests__/contacts-fake.js';
import { upTransaction } from '../../up-bank/__tests__/fixtures.js';
import { toParsedTransaction, upChecksum } from '../../up-bank/map-transaction.js';
import {
  countsOf,
  dropStagedRow,
  emptyLiveDraftPayload,
  fingerprintOf,
  readLiveDraftPayload,
  settleStagedRow,
  stageMappedRows,
} from '../live-draft.js';

import type { FinanceDb } from '../../../../db/services/internal.js';

let db: FinanceDb;
let accountId: string;
const contacts = makeContactsFake();

function target() {
  return { accountId, accountName: 'Up Everyday' };
}

function mapped(id: string, cents = -1_000, status: 'HELD' | 'SETTLED' = 'SETTLED') {
  return toParsedTransaction(
    upTransaction({ id, cents, status, createdAt: '2026-09-05T09:00:00+10:00' }),
    { accountId, accountLabel: 'Up Everyday' }
  );
}

beforeEach(() => {
  ({ db } = freshMigratedFinanceDb());
  accountId = createAccount(db, { name: 'Up Everyday', kind: 'savings', currency: 'AUD' }).id;
});

describe('stageMappedRows', () => {
  it('creates the draft on first arrival and grows it after, deduping against what it holds', async () => {
    const first = await stageMappedRows({
      db,
      contacts,
      target: target(),
      rows: [mapped('a')],
      balanceCents: 100,
    });
    expect(first).toMatchObject({ staged: 1, alreadyStaged: 0, alreadyInLedger: 0, created: true });

    const second = await stageMappedRows({
      db,
      contacts,
      target: target(),
      rows: [mapped('a'), mapped('b', -200)],
      balanceCents: 150,
    });
    expect(second).toMatchObject({
      draftId: first.draftId,
      staged: 1,
      alreadyStaged: 1,
      created: false,
    });

    const draft = getImportDraft(db, first.draftId);
    expect(draft).toMatchObject({ rowCount: 2, balanceReportedCents: 150, state: 'live' });
    const payload = readLiveDraftPayload(draft!);
    expect(payload.parsedTransactions.map((t) => t.amount)).toEqual([-10, -2]);
    expect(payload.parsedTransactionsFingerprint).toBe(fingerprintOf(payload.parsedTransactions));
    expect(payload.processedForFingerprint).toBe(payload.parsedTransactionsFingerprint);
    expect(countsOf(payload)).toEqual({
      rowCount: 2,
      unresolvedCount: 2,
      dateFrom: '2026-09-05',
      dateTo: '2026-09-05',
    });
  });

  it('never stages a row the ledger already has, and creates no draft for nothing', async () => {
    insertImportTransaction(db, {
      description: 'Coles',
      dialectAccountLabel: 'Up Everyday',
      accountId,
      amountCents: -1_000,
      date: '2026-09-05',
      type: 'purchase',
      tags: [],
      entityId: null,
      entityName: null,
      location: null,
      checksum: upChecksum(accountId, 'a'),
    });

    const result = await stageMappedRows({
      db,
      contacts,
      target: target(),
      rows: [mapped('a')],
      balanceCents: 100,
    });
    expect(result).toMatchObject({ staged: 0, alreadyInLedger: 1, created: false, draftId: '' });
    expect(listImportDrafts(db, { accountId })).toEqual([]);
  });

  it('keeps the balance it had when a later call reports none', async () => {
    const first = await stageMappedRows({
      db,
      contacts,
      target: target(),
      rows: [mapped('a')],
      balanceCents: 100,
    });
    await stageMappedRows({
      db,
      contacts,
      target: target(),
      rows: [mapped('b')],
      balanceCents: null,
    });
    expect(getImportDraft(db, first.draftId)?.balanceReportedCents).toBe(100);
  });

  it('starts a new draft once the collecting one has been claimed', async () => {
    const first = await stageMappedRows({
      db,
      contacts,
      target: target(),
      rows: [mapped('a')],
      balanceCents: 100,
    });
    claimImportDraft(db, first.draftId, 'tab-a');
    const next = await stageMappedRows({
      db,
      contacts,
      target: target(),
      rows: [mapped('b')],
      balanceCents: 100,
    });
    expect(next.created).toBe(true);
    expect(next.draftId).not.toBe(first.draftId);
    expect(getImportDraft(db, first.draftId)).toMatchObject({ state: 'saved', rowCount: 1 });
  });
});

describe('settleStagedRow and dropStagedRow', () => {
  it('settle rewrites the row in every bucket, drop removes it, and the last drop discards the draft', async () => {
    const { draftId } = await stageMappedRows({
      db,
      contacts,
      target: target(),
      rows: [mapped('h', -1_000, 'HELD'), mapped('k', -500)],
      balanceCents: 100,
    });

    const settled = toParsedTransaction(
      upTransaction({
        id: 'h',
        status: 'SETTLED',
        cents: -1_050,
        createdAt: '2026-09-05T09:00:00+10:00',
        settledAt: '2026-09-07T02:00:00+10:00',
      }),
      { accountId, accountLabel: 'Up Everyday' }
    );
    expect(settleStagedRow(db, accountId, settled)).toBe('changed');
    const payload = readLiveDraftPayload(getImportDraft(db, draftId)!);
    const row = payload.parsedTransactions.find((t) => t.checksum === settled.parsed.checksum);
    expect(row).toMatchObject({ pending: false, amount: -10.5, date: '2026-09-07' });
    const inBuckets = [
      ...payload.processedTransactions.matched,
      ...payload.processedTransactions.uncertain,
      ...payload.processedTransactions.failed,
    ].find((t) => t.checksum === settled.parsed.checksum);
    expect(inBuckets).toMatchObject({ pending: false, amount: -10.5 });
    expect(getImportDraft(db, draftId)).toMatchObject({
      dateFrom: '2026-09-05',
      dateTo: '2026-09-07',
    });

    expect(dropStagedRow(db, accountId, settled.parsed.checksum)).toBe('changed');
    expect(getImportDraft(db, draftId)).toMatchObject({ rowCount: 1, dateTo: '2026-09-05' });
    expect(dropStagedRow(db, accountId, mapped('k').parsed.checksum)).toBe('changed');
    expect(getImportDraft(db, draftId)).toBeUndefined();
  });

  it('reports absent for a row no draft holds, and open for a draft a tab holds', async () => {
    expect(settleStagedRow(db, accountId, mapped('nope'))).toBe('absent');
    expect(dropStagedRow(db, accountId, 'nope')).toBe('absent');

    const { draftId } = await stageMappedRows({
      db,
      contacts,
      target: target(),
      rows: [mapped('a')],
      balanceCents: 100,
    });
    claimImportDraft(db, draftId, 'tab-a');
    expect(settleStagedRow(db, accountId, mapped('a'))).toBe('open');
    expect(dropStagedRow(db, accountId, mapped('a').parsed.checksum)).toBe('open');
    expect(getImportDraft(db, draftId)?.rowCount).toBe(1);
  });

  it('a row the person already claimed but nobody holds is still settled in place', async () => {
    const { draftId } = await stageMappedRows({
      db,
      contacts,
      target: target(),
      rows: [mapped('h', -1_000, 'HELD')],
      balanceCents: 100,
    });
    claimImportDraft(db, draftId, 'tab-a');
    db.run(
      `UPDATE import_drafts SET owner_token = NULL, owner_seen_at = NULL WHERE id = '${draftId}'`
    );
    expect(settleStagedRow(db, accountId, mapped('h', -1_000, 'SETTLED'))).toBe('changed');
    expect(getImportDraft(db, draftId)?.state).toBe('saved');
  });
});

describe('emptyLiveDraftPayload', () => {
  it('lands on Process with nothing in it', () => {
    const payload = emptyLiveDraftPayload(target());
    expect(payload).toMatchObject({ currentStep: 3, dialectId: 'Up', accountId, rows: [] });
    expect(countsOf(payload)).toEqual({
      rowCount: 0,
      unresolvedCount: 0,
      dateFrom: null,
      dateTo: null,
    });
  });
});
