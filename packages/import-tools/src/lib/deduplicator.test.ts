import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findNewTransactions } from './deduplicator.js';

import type { ParsedTransaction } from './types.js';

function makeTxn(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    date: '2026-01-15',
    description: 'Test Transaction',
    amount: -50.0,
    account: 'ANZ Access',
    ...overrides,
  };
}

describe('findNewTransactions', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        account TEXT NOT NULL
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('returns all transactions when database is empty', () => {
    const batch = [makeTxn(), makeTxn({ amount: -100 })];
    const result = findNewTransactions(db, batch, 'ANZ Access');
    expect(result).toHaveLength(2);
  });

  it('filters out transactions that already exist', () => {
    db.prepare(
      'INSERT INTO transactions (id, date, description, amount, account) VALUES (?, ?, ?, ?, ?)'
    ).run('existing-1', '2026-01-15', 'Existing', -50.0, 'ANZ Access');

    const batch = [makeTxn()];
    const result = findNewTransactions(db, batch, 'ANZ Access');
    expect(result).toHaveLength(0);
  });

  it('allows duplicates when batch has more than existing count', () => {
    db.prepare(
      'INSERT INTO transactions (id, date, description, amount, account) VALUES (?, ?, ?, ?, ?)'
    ).run('existing-1', '2026-01-15', 'Existing', -50.0, 'ANZ Access');

    // Batch has 2 of same (date, amount), DB has 1 → 1 new
    const batch = [makeTxn(), makeTxn()];
    const result = findNewTransactions(db, batch, 'ANZ Access');
    expect(result).toHaveLength(1);
  });

  it('does not count transactions from different accounts', () => {
    db.prepare(
      'INSERT INTO transactions (id, date, description, amount, account) VALUES (?, ?, ?, ?, ?)'
    ).run('existing-1', '2026-01-15', 'Existing', -50.0, 'Up Spending');

    // Same date/amount but different account — should not deduplicate
    const batch = [makeTxn({ account: 'ANZ Access' })];
    const result = findNewTransactions(db, batch, 'ANZ Access');
    expect(result).toHaveLength(1);
  });

  it('handles multiple groups independently', () => {
    db.prepare(
      'INSERT INTO transactions (id, date, description, amount, account) VALUES (?, ?, ?, ?, ?)'
    ).run('existing-1', '2026-01-15', 'Groceries', -50.0, 'ANZ Access');

    const batch = [
      makeTxn({ amount: -50.0 }), // exists → filtered
      makeTxn({ amount: -75.0 }), // new amount → kept
      makeTxn({ date: '2026-01-16', amount: -50.0 }), // new date → kept
    ];
    const result = findNewTransactions(db, batch, 'ANZ Access');
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amount: -75.0 }),
        expect.objectContaining({ date: '2026-01-16' }),
      ])
    );
  });

  it('returns the last N items from a group as new transactions', () => {
    db.prepare(
      'INSERT INTO transactions (id, date, description, amount, account) VALUES (?, ?, ?, ?, ?)'
    ).run('existing-1', '2026-01-15', 'Existing', -50.0, 'ANZ Access');

    // 3 in batch, 1 exists → last 2 are new
    const batch = [
      makeTxn({ description: 'First' }),
      makeTxn({ description: 'Second' }),
      makeTxn({ description: 'Third' }),
    ];
    const result = findNewTransactions(db, batch, 'ANZ Access');
    expect(result).toHaveLength(2);
    expect(result[0]?.description).toBe('Second');
    expect(result[1]?.description).toBe('Third');
  });

  it('returns empty array when all transactions already exist', () => {
    const insert = db.prepare(
      'INSERT INTO transactions (id, date, description, amount, account) VALUES (?, ?, ?, ?, ?)'
    );
    insert.run('existing-1', '2026-01-15', 'A', -50.0, 'ANZ Access');
    insert.run('existing-2', '2026-01-15', 'B', -50.0, 'ANZ Access');

    const batch = [makeTxn(), makeTxn()];
    const result = findNewTransactions(db, batch, 'ANZ Access');
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty batch', () => {
    const result = findNewTransactions(db, [], 'ANZ Access');
    expect(result).toHaveLength(0);
  });

  it('handles positive and negative amounts as distinct groups', () => {
    db.prepare(
      'INSERT INTO transactions (id, date, description, amount, account) VALUES (?, ?, ?, ?, ?)'
    ).run('existing-1', '2026-01-15', 'Transfer Out', -100.0, 'ANZ Access');

    const batch = [
      makeTxn({ amount: -100.0 }), // exists → filtered
      makeTxn({ amount: 100.0 }), // positive, different group → kept
    ];
    const result = findNewTransactions(db, batch, 'ANZ Access');
    expect(result).toHaveLength(1);
    expect(result[0]?.amount).toBe(100.0);
  });
});
