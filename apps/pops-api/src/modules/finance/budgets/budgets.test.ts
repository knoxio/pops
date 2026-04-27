import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { budgets as budgetsTable } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import {
  createCaller,
  seedBudget,
  seedTransaction,
  setupTestContext,
} from '../../../shared/test-utils.js';
import { periodWindowStart } from './period-window.js';
import { listBudgets } from './service.js';

import type { Database } from 'better-sqlite3';

import type { Budget } from './types.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('budgets.list', () => {
  it('returns empty list when no budgets exist', async () => {
    const result = await caller.finance.budgets.list({});
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
  });

  it('returns all budgets with correct shape', async () => {
    seedBudget(db, { category: 'Groceries' });
    seedBudget(db, { category: 'Entertainment' });

    const result = await caller.finance.budgets.list({});
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);

    // Sorted by category
    expect(result.data[0]!.category).toBe('Entertainment');
    expect(result.data[1]!.category).toBe('Groceries');
  });

  it('returns camelCase fields', async () => {
    seedBudget(db, {
      category: 'Groceries',
      period: '2025-06',
      amount: 500,
      active: 1,
      notes: 'Monthly grocery budget',
      last_edited_time: '2025-06-15T10:00:00.000Z',
    });

    const result = await caller.finance.budgets.list({});
    const budget = result.data[0];
    expect(budget).toHaveProperty('id');
    expect(budget).toHaveProperty('category', 'Groceries');
    expect(budget).toHaveProperty('period', '2025-06');
    expect(budget).toHaveProperty('amount', 500);
    expect(budget).toHaveProperty('active', true);
    expect(budget).toHaveProperty('notes', 'Monthly grocery budget');
    expect(budget).toHaveProperty('lastEditedTime', '2025-06-15T10:00:00.000Z');
    expect(budget).toHaveProperty('spent');
    expect(budget).toHaveProperty('remaining');
    // No snake_case leaking
    expect(budget).not.toHaveProperty('notion_id');
    expect(budget).not.toHaveProperty('last_edited_time');
  });

  it('converts active from INTEGER to boolean (active=1)', async () => {
    seedBudget(db, { category: 'Groceries', active: 1 });

    const result = await caller.finance.budgets.list({});
    expect(result.data[0]!.active).toBe(true);
    expect(typeof result.data[0]!.active).toBe('boolean');
  });

  it('converts active from INTEGER to boolean (active=0)', async () => {
    seedBudget(db, { category: 'Groceries', active: 0 });

    const result = await caller.finance.budgets.list({});
    expect(result.data[0]!.active).toBe(false);
    expect(typeof result.data[0]!.active).toBe('boolean');
  });

  it('filters by search (case-insensitive LIKE on category)', async () => {
    seedBudget(db, { category: 'Groceries' });
    seedBudget(db, { category: 'Entertainment' });
    seedBudget(db, { category: 'Dining Out' });

    const result = await caller.finance.budgets.list({ search: 'grocer' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.category).toBe('Groceries');
    expect(result.pagination.total).toBe(1);
  });

  it('filters by period (exact match)', async () => {
    seedBudget(db, { category: 'Groceries', period: '2025-06' });
    seedBudget(db, { category: 'Entertainment', period: '2025-07' });
    seedBudget(db, { category: 'Dining', period: '2025-06' });

    const result = await caller.finance.budgets.list({ period: '2025-06' });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it('filters by active=true', async () => {
    seedBudget(db, { category: 'Groceries', active: 1 });
    seedBudget(db, { category: 'Entertainment', active: 0 });
    seedBudget(db, { category: 'Dining', active: 1 });

    const result = await caller.finance.budgets.list({ active: 'true' });
    expect(result.data).toHaveLength(2);
    expect(result.data.every((b: Budget) => b.active)).toBe(true);
  });

  it('filters by active=false', async () => {
    seedBudget(db, { category: 'Groceries', active: 1 });
    seedBudget(db, { category: 'Entertainment', active: 0 });
    seedBudget(db, { category: 'Dining', active: 0 });

    const result = await caller.finance.budgets.list({ active: 'false' });
    expect(result.data).toHaveLength(2);
    expect(result.data.every((b: Budget) => !b.active)).toBe(true);
  });

  it('combines all filters (search, period, active)', async () => {
    seedBudget(db, { category: 'Groceries Weekly', period: '2025-06', active: 1 });
    seedBudget(db, { category: 'Groceries Monthly', period: '2025-06', active: 0 });
    seedBudget(db, { category: 'Entertainment', period: '2025-06', active: 1 });

    const result = await caller.finance.budgets.list({
      search: 'grocer',
      period: '2025-06',
      active: 'true',
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.category).toBe('Groceries Weekly');
  });

  it('paginates with limit and offset', async () => {
    for (let i = 0; i < 10; i++) {
      seedBudget(db, { category: `Category ${String(i).padStart(2, '0')}` });
    }

    const page1 = await caller.finance.budgets.list({ limit: 3, offset: 0 });
    expect(page1.data).toHaveLength(3);
    expect(page1.pagination).toEqual({
      total: 10,
      limit: 3,
      offset: 0,
      hasMore: true,
    });

    const page2 = await caller.finance.budgets.list({ limit: 3, offset: 3 });
    expect(page2.data).toHaveLength(3);
    expect(page2.pagination.offset).toBe(3);

    // Categories should not overlap
    const page1Categories = page1.data.map((b: Budget) => b.category);
    const page2Categories = page2.data.map((b: Budget) => b.category);
    expect(page1Categories).not.toEqual(page2Categories);
  });

  it('defaults limit to 50 and offset to 0', async () => {
    const result = await caller.finance.budgets.list({});
    expect(result.pagination.limit).toBe(50);
    expect(result.pagination.offset).toBe(0);
  });

  it('throws UNAUTHORIZED without auth', async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.finance.budgets.list({})).rejects.toThrow(TRPCError);
    await expect(unauthCaller.finance.budgets.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('budgets.get', () => {
  it('returns a single budget by ID', async () => {
    const id = seedBudget(db, { category: 'Groceries', amount: 500 });

    const result = await caller.finance.budgets.get({ id });
    expect(result.data.id).toBe(id);
    expect(result.data.category).toBe('Groceries');
    expect(result.data.amount).toBe(500);
  });

  it('throws NOT_FOUND for non-existent ID', async () => {
    await expect(caller.finance.budgets.get({ id: 'does-not-exist' })).rejects.toThrow(TRPCError);
    await expect(caller.finance.budgets.get({ id: 'does-not-exist' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('budgets.create', () => {
  it('creates a budget with required fields only (just category)', async () => {
    const result = await caller.finance.budgets.create({ category: 'Groceries' });

    expect(result.message).toBe('Budget created');
    expect(result.data.category).toBe('Groceries');
    expect(result.data.id).toBeDefined();
    expect(result.data.period).toBeNull();
    expect(result.data.amount).toBeNull();
    expect(result.data.active).toBe(false);
    expect(result.data.notes).toBeNull();
  });

  it('creates a budget with all fields', async () => {
    const result = await caller.finance.budgets.create({
      category: 'Groceries',
      period: '2025-06',
      amount: 500,
      active: true,
      notes: 'Monthly grocery budget',
    });

    expect(result.data.category).toBe('Groceries');
    expect(result.data.period).toBe('2025-06');
    expect(result.data.amount).toBe(500);
    expect(result.data.active).toBe(true);
    expect(result.data.notes).toBe('Monthly grocery budget');
  });

  it('throws CONFLICT for duplicate category+period combination', async () => {
    seedBudget(db, { category: 'Groceries', period: '2025-06' });

    await expect(
      caller.finance.budgets.create({
        category: 'Groceries',
        period: '2025-06',
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.budgets.create({
        category: 'Groceries',
        period: '2025-06',
      })
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws CONFLICT for duplicate category with null period', async () => {
    seedBudget(db, { category: 'Groceries', period: null });

    await expect(
      caller.finance.budgets.create({
        category: 'Groceries',
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.budgets.create({
        category: 'Groceries',
      })
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('allows same category with different periods', async () => {
    seedBudget(db, { category: 'Groceries', period: '2025-06' });

    const result = await caller.finance.budgets.create({
      category: 'Groceries',
      period: '2025-07',
    });

    expect(result.data.category).toBe('Groceries');
    expect(result.data.period).toBe('2025-07');
  });

  it('persists to the database', async () => {
    await caller.finance.budgets.create({ category: 'New Budget' });

    const row = getDrizzle()
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.category, 'New Budget'))
      .get();
    expect(row).toBeDefined();
  });

  it('stores all fields in SQLite', async () => {
    const result = await caller.finance.budgets.create({
      category: 'Groceries',
      period: '2025-06',
      amount: 500,
      active: true,
      notes: 'Test notes',
    });

    // Verify all fields persisted in SQLite
    const row = getDrizzle()
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, result.data.id))
      .get();
    expect(row).toBeDefined();
    expect(row!.category).toBe('Groceries');
    expect(row!.period).toBe('2025-06');
    expect(row!.amount).toBe(500);
    expect(row!.active).toBe(1);
    expect(row!.notes).toBe('Test notes');
  });
});

describe('budgets.update', () => {
  it('updates a single field', async () => {
    const id = seedBudget(db, { category: 'Groceries' });

    const result = await caller.finance.budgets.update({ id, data: { amount: 600 } });

    expect(result.message).toBe('Budget updated');
    expect(result.data.category).toBe('Groceries');
    expect(result.data.amount).toBe(600);
  });

  it('updates multiple fields at once', async () => {
    const id = seedBudget(db, { category: 'Groceries' });

    const result = await caller.finance.budgets.update({
      id,
      data: {
        category: 'Food & Groceries',
        period: '2025-06',
        amount: 500,
      },
    });

    expect(result.data.category).toBe('Food & Groceries');
    expect(result.data.period).toBe('2025-06');
    expect(result.data.amount).toBe(500);
  });

  it('clears a field by setting to null', async () => {
    const id = seedBudget(db, { category: 'Groceries', amount: 500 });

    const result = await caller.finance.budgets.update({ id, data: { amount: null } });

    expect(result.data.amount).toBeNull();
  });

  it('toggles active from false to true', async () => {
    const id = seedBudget(db, { category: 'Groceries', active: 0 });

    const result = await caller.finance.budgets.update({ id, data: { active: true } });

    expect(result.data.active).toBe(true);
  });

  it('toggles active from true to false', async () => {
    const id = seedBudget(db, { category: 'Groceries', active: 1 });

    const result = await caller.finance.budgets.update({ id, data: { active: false } });

    expect(result.data.active).toBe(false);
  });

  it('updates last_edited_time', async () => {
    const id = seedBudget(db, {
      category: 'Groceries',
      last_edited_time: '2020-01-01T00:00:00.000Z',
    });

    await caller.finance.budgets.update({ id, data: { amount: 500 } });

    const row = getDrizzle()
      .select({ lastEditedTime: budgetsTable.lastEditedTime })
      .from(budgetsTable)
      .where(eq(budgetsTable.id, id))
      .get();
    expect(row!.lastEditedTime).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('throws NOT_FOUND for non-existent ID', async () => {
    await expect(
      caller.finance.budgets.update({
        id: 'does-not-exist',
        data: { category: 'New Category' },
      })
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.finance.budgets.update({
        id: 'does-not-exist',
        data: { category: 'New Category' },
      })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('persists update to SQLite', async () => {
    const id = seedBudget(db, { category: 'Groceries', amount: 500 });

    await caller.finance.budgets.update({ id, data: { amount: 600 } });

    // Verify SQLite was updated
    const row = getDrizzle()
      .select({ amount: budgetsTable.amount })
      .from(budgetsTable)
      .where(eq(budgetsTable.id, id))
      .get();
    expect(row!.amount).toBe(600);
  });
});

describe('budgets.delete', () => {
  it('deletes an existing budget', async () => {
    const id = seedBudget(db, { category: 'Groceries' });

    const result = await caller.finance.budgets.delete({ id });
    expect(result.message).toBe('Budget deleted');

    // Verify gone from DB
    const row = getDrizzle().select().from(budgetsTable).where(eq(budgetsTable.id, id)).get();
    expect(row).toBeUndefined();
  });

  it('throws NOT_FOUND for non-existent ID', async () => {
    await expect(caller.finance.budgets.delete({ id: 'does-not-exist' })).rejects.toThrow(
      TRPCError
    );
    await expect(caller.finance.budgets.delete({ id: 'does-not-exist' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('is idempotent — second delete throws NOT_FOUND', async () => {
    const id = seedBudget(db, { category: 'Groceries' });

    await caller.finance.budgets.delete({ id });
    await expect(caller.finance.budgets.delete({ id })).rejects.toThrow(TRPCError);
    await expect(caller.finance.budgets.delete({ id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('removes row from SQLite', async () => {
    const id = seedBudget(db, { category: 'Groceries' });

    await caller.finance.budgets.delete({ id });

    // Verify row is gone from SQLite
    const row = getDrizzle().select().from(budgetsTable).where(eq(budgetsTable.id, id)).get();
    expect(row).toBeUndefined();
  });
});

/**
 * Spend aggregation behaviour for `budgets.list`. The service exposes a
 * `now` override on `listBudgets()` so we can pin the period window to a
 * deterministic point — the tRPC caller does not expose that knob, so this
 * suite calls `listBudgets` directly.
 */
describe('budgets.list — spend aggregation', () => {
  // Pin "now" to mid-Feb 2026 so MTD = Feb-1 → today; YTD = Jan-1 → today.
  const NOW = new Date('2026-02-15T12:00:00.000Z');

  function seedGroceriesBudget(amount: number, period: string | null = 'Monthly'): string {
    return seedBudget(db, { category: 'Groceries', period, amount, active: 1 });
  }

  it('reports zero spend when no matching transactions exist', () => {
    seedGroceriesBudget(800);

    const { rows } = listBudgets({ limit: 10, offset: 0, now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.spent).toBe(0);
    expect(rows[0]!.remaining).toBe(800);
  });

  it('sums month-to-date outflows that match the budget category', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Woolworths',
      amount: -100,
      date: '2026-02-03',
      type: 'Expense',
      tags: JSON.stringify(['Groceries']),
    });
    seedTransaction(db, {
      description: 'Coles',
      amount: -50.5,
      date: '2026-02-10',
      type: 'Expense',
      tags: JSON.stringify(['Groceries']),
    });

    const { rows } = listBudgets({ limit: 10, offset: 0, now: NOW });
    expect(rows[0]!.spent).toBeCloseTo(150.5, 2);
    expect(rows[0]!.remaining).toBeCloseTo(649.5, 2);
  });

  it('ignores income (positive amounts) when summing spend', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Refund',
      amount: 25,
      date: '2026-02-05',
      type: 'Income',
      tags: JSON.stringify(['Groceries']),
    });

    const { rows } = listBudgets({ limit: 10, offset: 0, now: NOW });
    expect(rows[0]!.spent).toBe(0);
    expect(rows[0]!.remaining).toBe(800);
  });

  it('ignores transactions with type=Transfer', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Transfer to Savings',
      amount: -500,
      date: '2026-02-05',
      type: 'Transfer',
      tags: JSON.stringify(['Groceries', 'Transfer']),
    });

    const { rows } = listBudgets({ limit: 10, offset: 0, now: NOW });
    expect(rows[0]!.spent).toBe(0);
    expect(rows[0]!.remaining).toBe(800);
  });

  it('ignores transactions tagged with other categories', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Netflix',
      amount: -22.99,
      date: '2026-02-05',
      type: 'Expense',
      tags: JSON.stringify(['Entertainment']),
    });

    const { rows } = listBudgets({ limit: 10, offset: 0, now: NOW });
    expect(rows[0]!.spent).toBe(0);
  });

  it('yearly window includes prior months in the same year but excludes prior year', () => {
    seedGroceriesBudget(5000, 'Yearly');
    // Inside the YTD window
    seedTransaction(db, {
      description: 'January spend',
      amount: -200,
      date: '2026-01-15',
      type: 'Expense',
      tags: JSON.stringify(['Groceries']),
    });
    seedTransaction(db, {
      description: 'February spend',
      amount: -100,
      date: '2026-02-10',
      type: 'Expense',
      tags: JSON.stringify(['Groceries']),
    });
    // Prior year — should be excluded
    seedTransaction(db, {
      description: 'Last year December',
      amount: -999,
      date: '2025-12-28',
      type: 'Expense',
      tags: JSON.stringify(['Groceries']),
    });

    const { rows } = listBudgets({ limit: 10, offset: 0, now: NOW });
    expect(rows[0]!.spent).toBeCloseTo(300, 2);
    expect(rows[0]!.remaining).toBeCloseTo(4700, 2);
  });

  it('honours the custom `now` override for the period window', () => {
    seedGroceriesBudget(800);
    // Spend in March 2026 — only visible if "now" lands inside March.
    seedTransaction(db, {
      description: 'March spend',
      amount: -120,
      date: '2026-03-04',
      type: 'Expense',
      tags: JSON.stringify(['Groceries']),
    });

    const febNow = new Date('2026-02-20T12:00:00.000Z');
    const marchNow = new Date('2026-03-20T12:00:00.000Z');

    const feb = listBudgets({ limit: 10, offset: 0, now: febNow });
    const march = listBudgets({ limit: 10, offset: 0, now: marchNow });

    expect(feb.rows[0]!.spent).toBe(0);
    expect(march.rows[0]!.spent).toBeCloseTo(120, 2);
  });

  it('counts a multi-tag transaction once when it carries the budget category', () => {
    seedGroceriesBudget(800);
    seedTransaction(db, {
      description: 'Groceries + bonus',
      amount: -75,
      date: '2026-02-04',
      type: 'Expense',
      tags: JSON.stringify(['Groceries', 'Shopping', 'Essentials']),
    });

    const { rows } = listBudgets({ limit: 10, offset: 0, now: NOW });
    expect(rows[0]!.spent).toBeCloseTo(75, 2);
  });

  it('produces a negative `remaining` when spend exceeds the budget amount', () => {
    seedGroceriesBudget(100);
    seedTransaction(db, {
      description: 'Big shop',
      amount: -250,
      date: '2026-02-05',
      type: 'Expense',
      tags: JSON.stringify(['Groceries']),
    });

    const { rows } = listBudgets({ limit: 10, offset: 0, now: NOW });
    expect(rows[0]!.spent).toBeCloseTo(250, 2);
    expect(rows[0]!.remaining).toBeCloseTo(-150, 2);
    expect(rows[0]!.remaining! < 0).toBe(true);
  });
});

describe('periodWindowStart', () => {
  it('returns the first day of the current month for "Monthly"', () => {
    expect(periodWindowStart('Monthly', new Date('2026-02-15T12:00:00.000Z'))).toBe('2026-02-01');
    expect(periodWindowStart('Monthly', new Date('2026-12-31T23:59:59.000Z'))).toBe('2026-12-01');
    // Single-digit month should be zero-padded to keep ISO ordering.
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
