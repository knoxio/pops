/**
 * Invariant tests for the budgets service against an in-memory SQLite
 * seeded with the canonical `budgets` + `transactions` DDL — DB + service
 * layer only.
 *
 * The DDL is inlined rather than applied from the migration journal so
 * each test runs against a lean two-table fixture instead of the full
 * finance schema.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { BudgetConflictError, BudgetNotFoundError } from '../errors.js';
import {
  computeSpent,
  createBudget,
  deleteBudget,
  getBudget,
  listBudgets,
  periodWindowEnd,
  periodWindowStart,
  updateBudget,
  withSpend,
} from '../services/budgets.js';

import type { FinanceDb } from '../services/internal.js';

const BUDGETS_DDL = `
CREATE TABLE budgets (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  category text NOT NULL,
  period text,
  amount real,
  active integer DEFAULT 0 NOT NULL,
  notes text,
  last_edited_time text NOT NULL,
  owner_uri text,
  owner_uri_stale_at text
);
CREATE UNIQUE INDEX budgets_notion_id_unique ON budgets (notion_id);
CREATE UNIQUE INDEX idx_budgets_category_period ON budgets (category, COALESCE(period, char(0)));
CREATE INDEX idx_budgets_owner_uri ON budgets (owner_uri);

CREATE TABLE transactions (
  id text PRIMARY KEY NOT NULL,
  notion_id text,
  description text NOT NULL,
  account text NOT NULL,
  amount real NOT NULL,
  date text NOT NULL,
  type text NOT NULL,
  tags text DEFAULT '[]' NOT NULL,
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
CREATE INDEX idx_transactions_date ON transactions (date);
`;

function freshDb(): FinanceDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(BUDGETS_DDL);
  return drizzle(raw);
}

interface SeedTransactionInput {
  description: string;
  amount: number;
  date: string;
  type: string;
  tags: string[];
  account?: string;
}

function seedTransaction(db: FinanceDb, input: SeedTransactionInput): void {
  const raw = db.$client as Database.Database;
  raw
    .prepare(
      `INSERT INTO transactions (id, description, account, amount, date, type, tags, last_edited_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      crypto.randomUUID(),
      input.description,
      input.account ?? 'Test Account',
      input.amount,
      input.date,
      input.type,
      JSON.stringify(input.tags),
      new Date().toISOString()
    );
}

describe('createBudget', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a row with the supplied fields and a generated UUID', () => {
    const created = createBudget(db, {
      category: 'Groceries',
      period: 'Monthly',
      amount: 500,
      active: true,
      notes: 'Monthly grocery budget',
    });

    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(created.category).toBe('Groceries');
    expect(created.period).toBe('Monthly');
    expect(created.amount).toBe(500);
    expect(created.active).toBe(1);
    expect(created.notes).toBe('Monthly grocery budget');
    expect(created.lastEditedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('defaults optional fields to null and active to 0', () => {
    const created = createBudget(db, { category: 'Just the category' });
    expect(created.period).toBeNull();
    expect(created.amount).toBeNull();
    expect(created.active).toBe(0);
    expect(created.notes).toBeNull();
  });

  it('throws BudgetConflictError on duplicate (category, period)', () => {
    createBudget(db, { category: 'Groceries', period: 'Monthly' });

    let thrown: unknown;
    try {
      createBudget(db, { category: 'Groceries', period: 'Monthly' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BudgetConflictError);
    if (thrown instanceof BudgetConflictError) {
      expect(thrown.category).toBe('Groceries');
      expect(thrown.period).toBe('Monthly');
      expect(thrown.message).toContain("'Groceries'");
      expect(thrown.message).toContain("'Monthly'");
    }
  });

  it('throws BudgetConflictError on duplicate category with null period', () => {
    createBudget(db, { category: 'Groceries' });

    let thrown: unknown;
    try {
      createBudget(db, { category: 'Groceries' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BudgetConflictError);
    if (thrown instanceof BudgetConflictError) {
      expect(thrown.period).toBeNull();
      expect(thrown.message).toContain('null');
    }
  });

  it('allows the same category for different periods', () => {
    createBudget(db, { category: 'Groceries', period: 'Monthly' });
    const yearly = createBudget(db, { category: 'Groceries', period: 'Yearly' });
    expect(yearly.period).toBe('Yearly');
  });
});

describe('getBudget', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns the persisted row by id', () => {
    const created = createBudget(db, { category: 'Books' });
    const fetched = getBudget(db, created.id);
    expect(fetched).toEqual(created);
  });

  it('throws BudgetNotFoundError for an unknown id', () => {
    expect(() => getBudget(db, 'missing')).toThrow(BudgetNotFoundError);
  });
});

describe('listBudgets', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
    createBudget(db, { category: 'Apple monitor', period: 'Monthly', active: true });
    createBudget(db, { category: 'Apple keyboard', period: 'Yearly', active: false });
    createBudget(db, { category: 'Couch', active: true });
  });

  it('returns all rows sorted by category with a total count', () => {
    const result = listBudgets(db, { limit: 50, offset: 0 });
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.category)).toEqual([
      'Apple keyboard',
      'Apple monitor',
      'Couch',
    ]);
  });

  it('filters by LIKE on category (ASCII case-insensitive per SQLite default)', () => {
    const result = listBudgets(db, { search: 'apple', limit: 50, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.category.startsWith('Apple'))).toBe(true);
  });

  it('filters by period equality', () => {
    const result = listBudgets(db, { period: 'Monthly', limit: 50, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.period).toBe('Monthly');
  });

  it('filters by active=true', () => {
    const result = listBudgets(db, { active: true, limit: 50, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.active === 1)).toBe(true);
  });

  it('filters by active=false', () => {
    const result = listBudgets(db, { active: false, limit: 50, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.rows[0]?.active).toBe(0);
  });

  it('paginates via limit + offset and reports the unpaginated total', () => {
    const page1 = listBudgets(db, { limit: 2, offset: 0 });
    const page2 = listBudgets(db, { limit: 2, offset: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows).toHaveLength(2);
    expect(page2.total).toBe(3);
    expect(page2.rows).toHaveLength(1);
  });

  it('enriches each row with `spent` (0 by default) and `remaining`', () => {
    const result = listBudgets(db, { limit: 50, offset: 0 });
    for (const row of result.rows) {
      expect(row.spent).toBe(0);
      if (row.amount === null) {
        expect(row.remaining).toBeNull();
      } else {
        expect(row.remaining).toBe(row.amount);
      }
    }
  });
});

describe('updateBudget', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('patches only the supplied fields and bumps lastEditedTime', async () => {
    const created = createBudget(db, { category: 'Tent', amount: 100 });
    const original = created.lastEditedTime;
    await new Promise((r) => setTimeout(r, 5));

    const updated = updateBudget(db, created.id, { amount: 250, active: true });
    expect(updated.id).toBe(created.id);
    expect(updated.category).toBe('Tent');
    expect(updated.amount).toBe(250);
    expect(updated.active).toBe(1);
    expect(updated.lastEditedTime).not.toBe(original);
  });

  it('treats explicit null as a value (clears the field)', () => {
    const created = createBudget(db, { category: 'Helmet', notes: 'Black, matte' });
    const updated = updateBudget(db, created.id, { notes: null });
    expect(updated.notes).toBeNull();
  });

  it('toggles active true → false', () => {
    const created = createBudget(db, { category: 'Mug', active: true });
    const updated = updateBudget(db, created.id, { active: false });
    expect(updated.active).toBe(0);
  });

  it('is a no-op when the patch is empty (but still returns the row)', () => {
    const created = createBudget(db, { category: 'Empty' });
    const updated = updateBudget(db, created.id, {});
    expect(updated.lastEditedTime).toBe(created.lastEditedTime);
    expect(updated.category).toBe('Empty');
  });

  it('throws BudgetNotFoundError for an unknown id', () => {
    expect(() => updateBudget(db, 'missing', { category: 'x' })).toThrow(BudgetNotFoundError);
  });

  it('throws BudgetConflictError when an update would collide with an existing budget', () => {
    createBudget(db, { category: 'Food', period: 'Monthly', amount: 100 });
    const second = createBudget(db, { category: 'Groceries', period: 'Monthly', amount: 50 });

    let thrown: unknown;
    try {
      updateBudget(db, second.id, { category: 'Food' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BudgetConflictError);
    if (thrown instanceof BudgetConflictError) {
      expect(thrown.category).toBe('Food');
      expect(thrown.period).toBe('Monthly');
    }
  });

  it('uses post-patch (category, period) in the conflict error when period also changes', () => {
    createBudget(db, { category: 'Food', period: 'Yearly', amount: 1000 });
    const second = createBudget(db, { category: 'Groceries', period: 'Monthly', amount: 50 });

    let thrown: unknown;
    try {
      updateBudget(db, second.id, { category: 'Food', period: 'Yearly' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BudgetConflictError);
    if (thrown instanceof BudgetConflictError) {
      expect(thrown.category).toBe('Food');
      expect(thrown.period).toBe('Yearly');
    }
  });
});

describe('createBudget — UNIQUE constraint mapping (race-survivor)', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('maps a UNIQUE violation on INSERT to BudgetConflictError when the pre-check is bypassed', () => {
    createBudget(db, { category: 'Groceries', period: 'Monthly', amount: 100 });

    const raw = db.$client as Database.Database;
    raw.exec(`
      CREATE TRIGGER inject_duplicate
      BEFORE INSERT ON budgets
      WHEN NEW.category = 'RaceCategory' AND NEW.period = 'Monthly'
      BEGIN
        UPDATE budgets SET category = 'RaceCategory' WHERE category = 'Groceries' AND period = 'Monthly';
      END;
    `);

    let thrown: unknown;
    try {
      createBudget(db, { category: 'RaceCategory', period: 'Monthly', amount: 200 });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(BudgetConflictError);
    if (thrown instanceof BudgetConflictError) {
      expect(thrown.category).toBe('RaceCategory');
      expect(thrown.period).toBe('Monthly');
    }
  });
});

describe('deleteBudget', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('removes the row and subsequent get throws', () => {
    const created = createBudget(db, { category: 'Backpack' });
    deleteBudget(db, created.id);
    expect(() => getBudget(db, created.id)).toThrow(BudgetNotFoundError);
  });

  it('throws BudgetNotFoundError when the row is already gone', () => {
    expect(() => deleteBudget(db, 'missing')).toThrow(BudgetNotFoundError);
  });
});

describe('withSpend', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns spent=0 and remaining=amount when no transactions match', () => {
    const created = createBudget(db, { category: 'Groceries', amount: 800, period: 'Monthly' });
    const enriched = withSpend(db, created, new Date('2026-02-15T12:00:00.000Z'));
    expect(enriched.spent).toBe(0);
    expect(enriched.remaining).toBe(800);
  });

  it('returns remaining=null when the budget has no amount', () => {
    const created = createBudget(db, { category: 'Groceries', amount: null });
    const enriched = withSpend(db, created);
    expect(enriched.remaining).toBeNull();
  });
});

describe('listBudgets — spend aggregation', () => {
  let db: FinanceDb;
  const NOW = new Date('2026-02-15T12:00:00.000Z');

  beforeEach(() => {
    db = freshDb();
  });

  function seedGroceriesBudget(amount: number, period: string | null = 'Monthly'): void {
    createBudget(db, { category: 'Groceries', period, amount, active: true });
  }

  it('reports zero spend when no matching transactions exist', () => {
    seedGroceriesBudget(800);

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.spent).toBe(0);
    expect(rows[0]?.remaining).toBe(800);
  });

  it('sums month-to-date outflows that match the budget category', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Woolworths',
      amount: -100,
      date: '2026-02-03',
      type: 'Expense',
      tags: ['Groceries'],
    });
    seedTransaction(db, {
      description: 'Coles',
      amount: -50.5,
      date: '2026-02-10',
      type: 'Expense',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spent).toBeCloseTo(150.5, 2);
    expect(rows[0]?.remaining).toBeCloseTo(649.5, 2);
  });

  it('ignores income (positive amounts) when summing spend', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Refund',
      amount: 25,
      date: '2026-02-05',
      type: 'Income',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spent).toBe(0);
    expect(rows[0]?.remaining).toBe(800);
  });

  it('ignores transactions with type=Transfer', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Transfer to Savings',
      amount: -500,
      date: '2026-02-05',
      type: 'Transfer',
      tags: ['Groceries', 'Transfer'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spent).toBe(0);
    expect(rows[0]?.remaining).toBe(800);
  });

  it('ignores transactions tagged with other categories', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Netflix',
      amount: -22.99,
      date: '2026-02-05',
      type: 'Expense',
      tags: ['Entertainment'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spent).toBe(0);
  });

  it('yearly window includes prior months in the same year but excludes prior year', () => {
    seedGroceriesBudget(5000, 'Yearly');
    seedTransaction(db, {
      description: 'January spend',
      amount: -200,
      date: '2026-01-15',
      type: 'Expense',
      tags: ['Groceries'],
    });
    seedTransaction(db, {
      description: 'February spend',
      amount: -100,
      date: '2026-02-10',
      type: 'Expense',
      tags: ['Groceries'],
    });
    seedTransaction(db, {
      description: 'Last year December',
      amount: -999,
      date: '2025-12-28',
      type: 'Expense',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spent).toBeCloseTo(300, 2);
    expect(rows[0]?.remaining).toBeCloseTo(4700, 2);
  });

  it('clamps the upper bound of MTD/YTD to today (no future-dated counts)', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Future outflow',
      amount: -1000,
      date: '2026-02-28',
      type: 'Expense',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spent).toBe(0);
  });

  it('honours the custom `now` override for the period window', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'March spend',
      amount: -120,
      date: '2026-03-04',
      type: 'Expense',
      tags: ['Groceries'],
    });

    const febNow = new Date('2026-02-20T12:00:00.000Z');
    const marchNow = new Date('2026-03-20T12:00:00.000Z');

    const feb = listBudgets(db, { limit: 10, offset: 0, now: febNow });
    const march = listBudgets(db, { limit: 10, offset: 0, now: marchNow });

    expect(feb.rows[0]?.spent).toBe(0);
    expect(march.rows[0]?.spent).toBeCloseTo(120, 2);
  });

  it('counts a multi-tag transaction once when it carries the budget category', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Groceries + bonus',
      amount: -75,
      date: '2026-02-04',
      type: 'Expense',
      tags: ['Groceries', 'Shopping', 'Essentials'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spent).toBeCloseTo(75, 2);
  });

  it('produces a negative `remaining` when spend exceeds the budget amount', () => {
    seedGroceriesBudget(100);
    seedTransaction(db, {
      description: 'Big shop',
      amount: -250,
      date: '2026-02-05',
      type: 'Expense',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spent).toBeCloseTo(250, 2);
    expect(rows[0]?.remaining).toBeCloseTo(-150, 2);
  });

  it('null-period budgets aggregate spend across all time', () => {
    createBudget(db, { category: 'Groceries', period: null, amount: 1000, active: true });
    seedTransaction(db, {
      description: 'Last year',
      amount: -200,
      date: '2024-06-01',
      type: 'Expense',
      tags: ['Groceries'],
    });
    seedTransaction(db, {
      description: 'This year',
      amount: -300,
      date: '2026-02-10',
      type: 'Expense',
      tags: ['Groceries'],
    });

    const { rows } = listBudgets(db, { limit: 10, offset: 0, now: NOW });
    expect(rows[0]?.spent).toBeCloseTo(500, 2);
    expect(rows[0]?.remaining).toBeCloseTo(500, 2);
  });
});

describe('computeSpent', () => {
  let db: FinanceDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns 0 against an empty transactions table', () => {
    expect(computeSpent(db, 'Groceries', 'Monthly', new Date('2026-02-15T12:00:00.000Z'))).toBe(0);
  });

  it('aggregates only the targeted category', () => {
    seedTransaction(db, {
      description: 'Groceries',
      amount: -50,
      date: '2026-02-10',
      type: 'Expense',
      tags: ['Groceries'],
    });
    seedTransaction(db, {
      description: 'Coffee',
      amount: -10,
      date: '2026-02-10',
      type: 'Expense',
      tags: ['Coffee'],
    });

    expect(
      computeSpent(db, 'Groceries', 'Monthly', new Date('2026-02-15T12:00:00.000Z'))
    ).toBeCloseTo(50, 2);
  });
});

describe('periodWindowStart', () => {
  it('returns the first day of the current month for "Monthly"', () => {
    expect(periodWindowStart('Monthly', new Date('2026-02-15T12:00:00.000Z'))).toBe('2026-02-01');
    expect(periodWindowStart('Monthly', new Date('2026-12-31T23:59:59.000Z'))).toBe('2026-12-01');
    expect(periodWindowStart('Monthly', new Date('2026-03-04T00:00:00.000Z'))).toBe('2026-03-01');
  });

  it('returns the first day of the current year for "Yearly"', () => {
    expect(periodWindowStart('Yearly', new Date('2026-06-15T12:00:00.000Z'))).toBe('2026-01-01');
    expect(periodWindowStart('Yearly', new Date('2026-01-02T00:00:00.000Z'))).toBe('2026-01-01');
  });

  it('returns null for null/undefined/unknown periods (all-time)', () => {
    expect(periodWindowStart(null)).toBeNull();
    expect(periodWindowStart(undefined)).toBeNull();
    expect(periodWindowStart('')).toBeNull();
    expect(periodWindowStart('weekly')).toBeNull();
    expect(periodWindowStart('Quarterly')).toBeNull();
  });
});

describe('periodWindowEnd', () => {
  it('returns the zero-padded YYYY-MM-DD of `now`', () => {
    expect(periodWindowEnd(new Date('2026-02-05T12:00:00.000Z'))).toBe('2026-02-05');
    expect(periodWindowEnd(new Date('2026-12-31T23:59:59.000Z'))).toBe('2026-12-31');
  });
});
