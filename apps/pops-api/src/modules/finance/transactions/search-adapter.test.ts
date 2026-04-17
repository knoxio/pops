import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, setDb } from '../../../db.js';
import { createTestDb, seedTransaction } from '../../../shared/test-utils.js';
import { type TransactionHitData, transactionsSearchAdapter } from './search-adapter.js';

import type { Database } from 'better-sqlite3';

import type { SearchHit } from '../../core/search/index.js';

let db: Database;

beforeEach(() => {
  db = createTestDb();
  setDb(db);
});

afterEach(() => {
  closeDb();
});

const adapter = transactionsSearchAdapter;

describe('transactions search adapter', () => {
  it('is registered with correct domain, icon, and color', () => {
    expect(adapter.domain).toBe('transactions');
    expect(adapter.icon).toBe('ArrowRightLeft');
    expect(adapter.color).toBe('green');
  });

  it('returns empty array for empty query', () => {
    const hits = adapter.search({ text: '' }, { app: 'finance', page: null });
    expect(hits).toEqual([]);
  });

  it('returns empty array when no transactions match', () => {
    seedTransaction(db, { description: 'Woolworths groceries' });
    const hits = adapter.search({ text: 'Netflix' }, { app: 'finance', page: null });
    expect(hits).toEqual([]);
  });

  it('finds exact match with score 1.0', () => {
    seedTransaction(db, {
      description: 'Netflix',
      amount: -15.99,
      date: '2026-03-01',
      type: 'expense',
    });
    const hits = adapter.search(
      { text: 'Netflix' },
      { app: 'finance', page: null }
    ) as SearchHit<TransactionHitData>[];

    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.matchType).toBe('exact');
    expect(hits[0]!.matchField).toBe('description');
    expect(hits[0]!.data.description).toBe('Netflix');
    expect(hits[0]!.data.amount).toBe(-15.99);
    expect(hits[0]!.data.type).toBe('expense');
  });

  it('finds exact match case-insensitively', () => {
    seedTransaction(db, { description: 'Netflix', type: 'expense' });
    const hits = adapter.search(
      { text: 'netflix' },
      { app: 'finance', page: null }
    ) as SearchHit<TransactionHitData>[];

    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.matchType).toBe('exact');
  });

  it('finds prefix match with score 0.8', () => {
    seedTransaction(db, { description: 'Netflix monthly subscription', type: 'expense' });
    const hits = adapter.search(
      { text: 'Netflix' },
      { app: 'finance', page: null }
    ) as SearchHit<TransactionHitData>[];

    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(0.8);
    expect(hits[0]!.matchType).toBe('prefix');
  });

  it('finds contains match with score 0.5', () => {
    seedTransaction(db, { description: 'Payment to Netflix AU', type: 'expense' });
    const hits = adapter.search(
      { text: 'Netflix' },
      { app: 'finance', page: null }
    ) as SearchHit<TransactionHitData>[];

    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(0.5);
    expect(hits[0]!.matchType).toBe('contains');
  });

  it('sorts hits by score descending', () => {
    seedTransaction(db, { description: 'Netflix', type: 'expense' });
    seedTransaction(db, { description: 'Netflix monthly', type: 'expense' });
    seedTransaction(db, { description: 'Payment Netflix', type: 'expense' });
    const hits = adapter.search(
      { text: 'Netflix' },
      { app: 'finance', page: null }
    ) as SearchHit<TransactionHitData>[];

    expect(hits).toHaveLength(3);
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[1]!.score).toBe(0.8);
    expect(hits[2]!.score).toBe(0.5);
  });

  it('respects options.limit', () => {
    seedTransaction(db, { description: 'Coffee shop A', type: 'expense' });
    seedTransaction(db, { description: 'Coffee shop B', type: 'expense' });
    seedTransaction(db, { description: 'Coffee shop C', type: 'expense' });
    const hits = adapter.search({ text: 'Coffee' }, { app: 'finance', page: null }, { limit: 2 });

    expect(hits).toHaveLength(2);
  });

  it('returns correct hit data shape with URI', () => {
    const id = seedTransaction(db, {
      description: 'Woolworths groceries',
      amount: -85.42,
      date: '2026-03-15',
      entity_name: 'Woolworths',
      type: 'expense',
    });
    const hits = adapter.search(
      { text: 'Woolworths' },
      { app: 'finance', page: null }
    ) as SearchHit<TransactionHitData>[];

    expect(hits).toHaveLength(1);
    expect(hits[0]!.uri).toBe(`pops:finance/transaction/${id}`);
    expect(hits[0]!.data).toEqual({
      description: 'Woolworths groceries',
      amount: -85.42,
      date: '2026-03-15',
      entityName: 'Woolworths',
      type: 'expense',
    });
  });

  it('returns null entityName when transaction has no entity', () => {
    seedTransaction(db, { description: 'Random purchase', type: 'expense' });
    const hits = adapter.search(
      { text: 'Random' },
      { app: 'finance', page: null }
    ) as SearchHit<TransactionHitData>[];

    expect(hits).toHaveLength(1);
    expect(hits[0]!.data.entityName).toBeNull();
  });

  it('trims whitespace from query', () => {
    seedTransaction(db, { description: 'Netflix', type: 'expense' });
    const hits = adapter.search({ text: '  Netflix  ' }, { app: 'finance', page: null });

    expect(hits).toHaveLength(1);
  });
});
