/**
 * Invariant tests for the transactions service against an in-memory SQLite
 * seeded with the canonical `transactions` DDL. Pure DB + service layer —
 * no tRPC, no Express, no auth middleware.
 *
 * Higher-level router coverage lives in pops-api's own integration suite
 * and exercises the same service via the pops-api wrapper.
 *
 * The DDL is inlined (rather than read from the shared baseline
 * `0000_naive_chameleon.sql` or the package's own `0053_finance_pillar_baseline`)
 * because those create the entire pre-modular schema and applying them for
 * every test here is wasted work. Phase 1 PR 2 of N2 will move the canonical
 * statement into the package's own migration journal alongside the other
 * finance-owned tables — until then this inlined copy is the test fixture.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { TransactionAlreadyExistsError, TransactionNotFoundError } from '../errors.js';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  restoreTransaction,
  updateTransaction,
} from '../services/transactions.js';

import type { FinanceDb } from '../services/internal.js';

const TRANSACTIONS_DDL = `
CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  description text NOT NULL,
  account text NOT NULL,
  amount real NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  tags text NOT NULL DEFAULT '[]',
  entity_id text,
  entity_name text,
  location text,
  country text,
  related_transaction_id text,
  notes text,
  checksum text,
  raw_row text,
  last_edited_time text NOT NULL
);
CREATE UNIQUE INDEX transactions_notion_id_unique ON transactions (notion_id);
CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_account ON transactions (account);
CREATE INDEX idx_transactions_entity ON transactions (entity_id);
CREATE INDEX idx_transactions_last_edited ON transactions (last_edited_time);
CREATE INDEX idx_transactions_notion_id ON transactions (notion_id);
CREATE UNIQUE INDEX idx_transactions_checksum ON transactions (checksum);
`;

function freshDb(): FinanceDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(TRANSACTIONS_DDL);
  return drizzle(raw);
}

describe('createTransaction', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a row with the supplied fields and a generated UUID', () => {
    const created = createTransaction(db, {
      description: 'Groceries',
      account: 'Up Savings',
      amount: 50.0,
      date: '2025-06-15',
      type: 'Purchase',
    });

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(created.description).toBe('Groceries');
    expect(created.account).toBe('Up Savings');
    expect(created.amount).toBe(50.0);
    expect(created.date).toBe('2025-06-15');
    expect(created.type).toBe('Purchase');
    expect(created.tags).toBe('[]');
    expect(created.lastEditedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('defaults type to empty string when omitted', () => {
    const created = createTransaction(db, {
      description: 'Test',
      account: 'Up',
      amount: 10,
      date: '2025-06-15',
    });
    expect(created.type).toBe('');
  });

  it('serialises tags as a JSON string', () => {
    const created = createTransaction(db, {
      description: 'Test',
      account: 'Up',
      amount: 10,
      date: '2025-06-15',
      tags: ['Groceries', 'Online'],
    });
    expect(created.tags).toBe('["Groceries","Online"]');
  });

  it('defaults optional reference fields to null', () => {
    const created = createTransaction(db, {
      description: 'Test',
      account: 'Up',
      amount: 10,
      date: '2025-06-15',
    });
    expect(created.entityId).toBeNull();
    expect(created.entityName).toBeNull();
    expect(created.location).toBeNull();
    expect(created.country).toBeNull();
    expect(created.relatedTransactionId).toBeNull();
    expect(created.notes).toBeNull();
    expect(created.checksum).toBeNull();
    expect(created.rawRow).toBeNull();
  });

  it('persists every supplied optional field', () => {
    const created = createTransaction(db, {
      description: 'Woolworths Groceries',
      account: 'Up Savings',
      amount: 150.75,
      date: '2025-06-15',
      type: 'Purchase',
      tags: ['Groceries'],
      entityId: 'ent-123',
      entityName: 'Woolworths',
      location: 'Sydney CBD',
      country: 'Australia',
      relatedTransactionId: 'txn-456',
      notes: 'Weekly shop',
      checksum: 'abc123',
      rawRow: '15/06/2025,Woolworths,150.75',
    });

    expect(created.entityId).toBe('ent-123');
    expect(created.entityName).toBe('Woolworths');
    expect(created.location).toBe('Sydney CBD');
    expect(created.country).toBe('Australia');
    expect(created.relatedTransactionId).toBe('txn-456');
    expect(created.notes).toBe('Weekly shop');
    expect(created.checksum).toBe('abc123');
    expect(created.rawRow).toBe('15/06/2025,Woolworths,150.75');
  });
});

describe('getTransaction', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the persisted row by id', () => {
    const created = createTransaction(db, {
      description: 'X',
      account: 'Up',
      amount: 1,
      date: '2025-06-15',
    });
    const fetched = getTransaction(db, created.id);
    expect(fetched).toEqual(created);
  });

  it('throws TransactionNotFoundError for an unknown id', () => {
    expect(() => getTransaction(db, 'missing')).toThrow(TransactionNotFoundError);
  });

  it('TransactionNotFoundError carries the offending id', () => {
    try {
      getTransaction(db, 'nope-123');
      expect.fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(TransactionNotFoundError);
      expect((error as TransactionNotFoundError).id).toBe('nope-123');
    }
  });
});

describe('listTransactions', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
    createTransaction(db, {
      description: 'Woolworths Groceries',
      account: 'Up Savings',
      amount: 50,
      date: '2025-06-15',
      type: 'Purchase',
      tags: ['Groceries', 'Online'],
      entityId: 'ent-123',
    });
    createTransaction(db, {
      description: 'Coles Groceries',
      account: 'ANZ Visa',
      amount: 30,
      date: '2025-06-14',
      type: 'Purchase',
      tags: ['Groceries'],
      entityId: 'ent-456',
    });
    createTransaction(db, {
      description: 'Fuel Station',
      account: 'Up Savings',
      amount: 60,
      date: '2025-06-13',
      type: 'Purchase',
      tags: ['Transport'],
    });
    createTransaction(db, {
      description: 'Salary',
      account: 'Up Savings',
      amount: 5000,
      date: '2025-05-30',
      type: 'Income',
    });
  });

  it('returns all rows sorted by date DESC with a total count', () => {
    const result = listTransactions(db, {}, 50, 0);
    expect(result.total).toBe(4);
    expect(result.rows.map((r) => r.description)).toEqual([
      'Woolworths Groceries',
      'Coles Groceries',
      'Fuel Station',
      'Salary',
    ]);
  });

  it('filters by description LIKE (ASCII case-insensitive per SQLite default)', () => {
    const result = listTransactions(db, { search: 'wool' }, 50, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.description).toBe('Woolworths Groceries');
  });

  it('filters by exact account', () => {
    const result = listTransactions(db, { account: 'ANZ Visa' }, 50, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.description).toBe('Coles Groceries');
  });

  it('filters by startDate inclusive', () => {
    const result = listTransactions(db, { startDate: '2025-06-14' }, 50, 0);
    expect(result.total).toBe(2);
    expect(result.rows.map((r) => r.description)).toEqual([
      'Woolworths Groceries',
      'Coles Groceries',
    ]);
  });

  it('filters by endDate inclusive', () => {
    const result = listTransactions(db, { endDate: '2025-06-13' }, 50, 0);
    expect(result.total).toBe(2);
    expect(result.rows.map((r) => r.description)).toEqual(['Fuel Station', 'Salary']);
  });

  it('filters by date range', () => {
    const result = listTransactions(db, { startDate: '2025-06-13', endDate: '2025-06-14' }, 50, 0);
    expect(result.total).toBe(2);
    expect(result.rows.map((r) => r.description)).toEqual(['Coles Groceries', 'Fuel Station']);
  });

  it('filters by tag membership (json_each match)', () => {
    const result = listTransactions(db, { tag: 'Groceries' }, 50, 0);
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.tags.includes('Groceries'))).toBe(true);
  });

  it('does not match partial tag substrings', () => {
    const result = listTransactions(db, { tag: 'Groc' }, 50, 0);
    expect(result.total).toBe(0);
  });

  it('filters by entityId equality', () => {
    const result = listTransactions(db, { entityId: 'ent-123' }, 50, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.description).toBe('Woolworths Groceries');
  });

  it('filters by type', () => {
    const result = listTransactions(db, { type: 'Income' }, 50, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.description).toBe('Salary');
  });

  it('combines multiple filters as AND', () => {
    const result = listTransactions(
      db,
      { account: 'Up Savings', type: 'Purchase', tag: 'Transport' },
      50,
      0
    );
    expect(result.total).toBe(1);
    expect(result.rows[0]?.description).toBe('Fuel Station');
  });

  it('paginates via limit + offset and reports the unpaginated total', () => {
    const page1 = listTransactions(db, {}, 2, 0);
    const page2 = listTransactions(db, {}, 2, 2);
    expect(page1.total).toBe(4);
    expect(page1.rows).toHaveLength(2);
    expect(page2.total).toBe(4);
    expect(page2.rows).toHaveLength(2);
    const page1Ids = page1.rows.map((r) => r.id);
    const page2Ids = page2.rows.map((r) => r.id);
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
  });

  it('returns an empty result with total=0 for an unmatched filter', () => {
    const result = listTransactions(db, { account: 'nope' }, 50, 0);
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  });
});

describe('updateTransaction', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('patches only the supplied fields and bumps lastEditedTime', async () => {
    const created = createTransaction(db, {
      description: 'Original',
      account: 'Up',
      amount: 10,
      date: '2025-06-15',
    });
    const original = created.lastEditedTime;
    await new Promise((r) => setTimeout(r, 5));

    const updated = updateTransaction(db, created.id, { description: 'Updated', amount: 25 });
    expect(updated.id).toBe(created.id);
    expect(updated.description).toBe('Updated');
    expect(updated.amount).toBe(25);
    expect(updated.account).toBe('Up');
    expect(updated.date).toBe('2025-06-15');
    expect(updated.lastEditedTime).not.toBe(original);
  });

  it('re-serialises tags from an array to a JSON string', () => {
    const created = createTransaction(db, {
      description: 'Test',
      account: 'Up',
      amount: 10,
      date: '2025-06-15',
      tags: ['Old'],
    });
    const updated = updateTransaction(db, created.id, { tags: ['Shopping', 'Online'] });
    expect(updated.tags).toBe('["Shopping","Online"]');
  });

  it('clears a nullable field by setting to null', () => {
    const created = createTransaction(db, {
      description: 'Test',
      account: 'Up',
      amount: 10,
      date: '2025-06-15',
      notes: 'Some notes',
      entityId: 'ent-1',
      entityName: 'Foo',
      location: 'Sydney',
      country: 'AU',
      relatedTransactionId: 'rel-1',
    });
    const updated = updateTransaction(db, created.id, {
      notes: null,
      entityId: null,
      entityName: null,
      location: null,
      country: null,
      relatedTransactionId: null,
    });
    expect(updated.notes).toBeNull();
    expect(updated.entityId).toBeNull();
    expect(updated.entityName).toBeNull();
    expect(updated.location).toBeNull();
    expect(updated.country).toBeNull();
    expect(updated.relatedTransactionId).toBeNull();
  });

  it('is a no-op when the patch is empty (but still returns the row)', () => {
    const created = createTransaction(db, {
      description: 'Test',
      account: 'Up',
      amount: 10,
      date: '2025-06-15',
    });
    const updated = updateTransaction(db, created.id, {});
    expect(updated.lastEditedTime).toBe(created.lastEditedTime);
    expect(updated.description).toBe('Test');
  });

  it('throws TransactionNotFoundError for an unknown id', () => {
    expect(() => updateTransaction(db, 'missing', { description: 'x' })).toThrow(
      TransactionNotFoundError
    );
  });
});

describe('deleteTransaction', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('removes the row and returns the snapshot', () => {
    const created = createTransaction(db, {
      description: 'To Delete',
      account: 'Up',
      amount: 10,
      date: '2025-06-15',
      tags: ['X'],
      notes: 'Bye',
    });
    const snapshot = deleteTransaction(db, created.id);
    expect(snapshot).toEqual(created);
    expect(() => getTransaction(db, created.id)).toThrow(TransactionNotFoundError);
  });

  it('throws TransactionNotFoundError when the row is already gone', () => {
    const created = createTransaction(db, {
      description: 'X',
      account: 'Up',
      amount: 1,
      date: '2025-06-15',
    });
    deleteTransaction(db, created.id);
    expect(() => deleteTransaction(db, created.id)).toThrow(TransactionNotFoundError);
  });

  it('throws TransactionNotFoundError for an unknown id', () => {
    expect(() => deleteTransaction(db, 'missing')).toThrow(TransactionNotFoundError);
  });
});

describe('restoreTransaction', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('re-inserts a deleted row preserving id and dedup metadata', () => {
    const created = createTransaction(db, {
      description: 'Restored',
      account: 'Up',
      amount: 99,
      date: '2025-06-15',
      tags: ['Z'],
      checksum: 'sum-1',
      rawRow: 'raw-1',
    });
    const snapshot = deleteTransaction(db, created.id);

    const restored = restoreTransaction(db, snapshot);
    expect(restored.id).toBe(created.id);
    expect(restored.checksum).toBe('sum-1');
    expect(restored.rawRow).toBe('raw-1');
    expect(restored.description).toBe('Restored');
    expect(restored.tags).toBe(snapshot.tags);
    expect(restored.lastEditedTime).toBe(snapshot.lastEditedTime);
  });

  it('throws TransactionAlreadyExistsError if a row with the same id exists', () => {
    const created = createTransaction(db, {
      description: 'X',
      account: 'Up',
      amount: 1,
      date: '2025-06-15',
    });
    expect(() => restoreTransaction(db, created)).toThrow(TransactionAlreadyExistsError);
  });

  it('TransactionAlreadyExistsError carries the conflicting id', () => {
    const created = createTransaction(db, {
      description: 'X',
      account: 'Up',
      amount: 1,
      date: '2025-06-15',
    });
    try {
      restoreTransaction(db, created);
      expect.fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(TransactionAlreadyExistsError);
      expect((error as TransactionAlreadyExistsError).id).toBe(created.id);
    }
  });
});
