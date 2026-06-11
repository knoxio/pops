/**
 * Unit tests for the transaction URI handler (Track O3, #2845).
 *
 * Drives `createTransactionUriHandler` against a per-test file-backed
 * finance.db (under a fresh tmpdir) so the resolution paths are exercised end-to-end against the
 * real `transactionsService.getTransaction` — `not-found` for an absent
 * row, `object` for an existing one, and `not-found` for an unrecognised
 * type (the descriptor only advertises `transaction`, but the dispatcher
 * contract still asks us to handle a mismatched type gracefully).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, transactionsService, type OpenedFinanceDb } from '@pops/finance-db';

import { createTransactionUriHandler, TRANSACTION_URI_TYPES } from './uri-handler.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'transaction-uri-handler-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('createTransactionUriHandler', () => {
  it('declares the transaction type', () => {
    const handler = createTransactionUriHandler(financeDb.db);
    expect(handler.types).toEqual(TRANSACTION_URI_TYPES);
    expect(handler.types).toEqual(['transaction']);
  });

  it('resolves an existing transaction to { kind: "object" } with the row', async () => {
    const handler = createTransactionUriHandler(financeDb.db);
    const row = transactionsService.createTransaction(financeDb.db, {
      description: 'Groceries',
      account: 'Up Savings',
      amount: 50.0,
      date: '2025-06-15',
      type: 'Purchase',
    });

    const result = await handler.resolve('transaction', row.id);

    expect(result.kind).toBe('object');
    if (result.kind !== 'object') throw new Error('unreachable');
    expect(result.data).toMatchObject({
      id: row.id,
      description: 'Groceries',
      account: 'Up Savings',
      amount: 50.0,
      date: '2025-06-15',
      type: 'Purchase',
    });
  });

  it('returns { kind: "not-found" } for an unknown id (does not throw)', async () => {
    const handler = createTransactionUriHandler(financeDb.db);
    const result = await handler.resolve('transaction', 'no-such-transaction');
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('returns { kind: "not-found" } for a type the handler does not own', async () => {
    const handler = createTransactionUriHandler(financeDb.db);
    const result = await handler.resolve('budget', 'irrelevant');
    expect(result).toEqual({ kind: 'not-found' });
  });
});
