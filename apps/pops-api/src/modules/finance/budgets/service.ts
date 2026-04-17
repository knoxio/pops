import { and, asc, count, eq, isNull, like } from 'drizzle-orm';

/**
 * Budget service — CRUD operations against SQLite via Drizzle ORM.
 * SQLite is the source of truth. All operations are local.
 */
import { budgets } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type { BudgetRow, CreateBudgetInput, UpdateBudgetInput } from './types.js';

/** Count + rows for a paginated list. */
export interface BudgetListResult {
  rows: BudgetRow[];
  total: number;
}

/**
 * List budgets with optional filters.
 * @param search - LIKE search on category field
 * @param period - Exact match on period field
 * @param active - Filter by active status (boolean)
 */
export function listBudgets(
  search: string | undefined,
  period: string | undefined,
  active: boolean | undefined,
  limit: number,
  offset: number
): BudgetListResult {
  const db = getDrizzle();
  const conditions = [];

  if (search) {
    conditions.push(like(budgets.category, `%${search}%`));
  }
  if (period) {
    conditions.push(eq(budgets.period, period));
  }
  if (active !== undefined) {
    conditions.push(eq(budgets.active, active ? 1 : 0));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(budgets)
    .where(where)
    .orderBy(asc(budgets.category))
    .limit(limit)
    .offset(offset)
    .all();
  const countRow = db.select({ total: count() }).from(budgets).where(where).all()[0];
  const total = countRow?.total ?? 0;

  return { rows, total };
}

/** Get a single budget by id. Throws NotFoundError if missing. */
export function getBudget(id: string): BudgetRow {
  const db = getDrizzle();
  const row = db.select().from(budgets).where(eq(budgets.id, id)).get();

  if (!row) throw new NotFoundError('Budget', id);
  return row;
}

/**
 * Create a new budget. Returns the created row.
 * Throws ConflictError if a budget with the same category+period combination already exists.
 * Generates a local UUID and inserts directly into SQLite.
 */
export function createBudget(input: CreateBudgetInput): BudgetRow {
  const db = getDrizzle();

  // Check for duplicate category+period combination
  const existing = db
    .select({ id: budgets.id })
    .from(budgets)
    .where(
      and(
        eq(budgets.category, input.category),
        input.period != null ? eq(budgets.period, input.period) : isNull(budgets.period)
      )
    )
    .get();

  if (existing) {
    const periodDesc = input.period ? `'${input.period}'` : 'null';
    throw new ConflictError(
      `Budget with category '${input.category}' and period ${periodDesc} already exists`
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(budgets)
    .values({
      id,
      category: input.category,
      period: input.period ?? null,
      amount: input.amount ?? null,
      active: input.active ? 1 : 0,
      notes: input.notes ?? null,
      lastEditedTime: now,
    })
    .run();

  return getBudget(id);
}

/**
 * Update an existing budget. Returns the updated row.
 * Updates directly in SQLite.
 */
export function updateBudget(id: string, input: UpdateBudgetInput): BudgetRow {
  const db = getDrizzle();

  // Verify it exists first
  getBudget(id);

  const updates: Partial<typeof budgets.$inferInsert> = {};
  let hasUpdates = false;

  if (input.category !== undefined) {
    updates.category = input.category;
    hasUpdates = true;
  }
  if (input.period !== undefined) {
    updates.period = input.period ?? null;
    hasUpdates = true;
  }
  if (input.amount !== undefined) {
    updates.amount = input.amount ?? null;
    hasUpdates = true;
  }
  if (input.active !== undefined) {
    updates.active = input.active ? 1 : 0;
    hasUpdates = true;
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes ?? null;
    hasUpdates = true;
  }

  if (hasUpdates) {
    updates.lastEditedTime = new Date().toISOString();
    db.update(budgets).set(updates).where(eq(budgets.id, id)).run();
  }

  return getBudget(id);
}

/**
 * Delete a budget by ID. Throws NotFoundError if missing.
 * Deletes directly from SQLite.
 */
export function deleteBudget(id: string): void {
  // Verify it exists first
  getBudget(id);

  const db = getDrizzle();
  const result = db.delete(budgets).where(eq(budgets.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Budget', id);
}
