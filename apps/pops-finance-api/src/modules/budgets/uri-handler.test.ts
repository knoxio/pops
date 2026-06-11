/**
 * Unit tests for the budget URI handler (Track O2, #2844).
 *
 * Drives `createBudgetUriHandler` against a per-test in-memory finance.db so
 * the resolution paths are exercised end-to-end against the real
 * `budgetsService.getBudget` — `not-found` for an absent row, `object` for an
 * existing one, and `not-found` for an unrecognised type (the descriptor only
 * advertises `budget`, but the dispatcher contract still asks us to handle a
 * mismatched type gracefully).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { budgetsService, openFinanceDb, type OpenedFinanceDb } from '@pops/finance-db';

import { BUDGET_URI_TYPES, createBudgetUriHandler } from './uri-handler.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'budget-uri-handler-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('createBudgetUriHandler', () => {
  it('declares the budget type', () => {
    const handler = createBudgetUriHandler(financeDb.db);
    expect(handler.types).toEqual(BUDGET_URI_TYPES);
    expect(handler.types).toEqual(['budget']);
  });

  it('resolves an existing budget to { kind: "object" } with the row', async () => {
    const handler = createBudgetUriHandler(financeDb.db);
    const row = budgetsService.createBudget(financeDb.db, {
      category: 'Groceries',
      period: 'Monthly',
      amount: 800,
      active: true,
    });

    const result = await handler.resolve('budget', row.id);

    expect(result.kind).toBe('object');
    if (result.kind !== 'object') throw new Error('unreachable');
    expect(result.data).toMatchObject({
      id: row.id,
      category: 'Groceries',
      period: 'Monthly',
    });
  });

  it('returns { kind: "not-found" } for an unknown id (does not throw)', async () => {
    const handler = createBudgetUriHandler(financeDb.db);
    const result = await handler.resolve('budget', 'no-such-budget');
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('returns { kind: "not-found" } for a type the handler does not own', async () => {
    const handler = createBudgetUriHandler(financeDb.db);
    const result = await handler.resolve('transaction', 'irrelevant');
    expect(result).toEqual({ kind: 'not-found' });
  });
});
