import { and, asc, count, eq, isNull, like, sql } from 'drizzle-orm';

/**
 * Budget service — CRUD operations against SQLite via Drizzle ORM.
 * SQLite is the source of truth. All operations are local.
 */
import { budgets, transactions } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { periodWindowEnd, periodWindowStart } from './period-window.js';

import type { BudgetRow, CreateBudgetInput, UpdateBudgetInput } from './types.js';

/** Count + rows for a paginated list. */
export interface BudgetListResult {
  rows: BudgetWithSpend[];
  total: number;
}

/** A budget row plus aggregated spend over its period. */
export interface BudgetWithSpend extends BudgetRow {
  spent: number;
  remaining: number | null;
}

export interface ListBudgetsOptions {
  search?: string;
  period?: string;
  active?: boolean;
  limit: number;
  offset: number;
  /**
   * Reference timestamp used to derive the period window. Defaults to the
   * current time. Override in tests to make the window deterministic.
   */
  now?: Date;
}

/**
 * Compute the total spent against a budget's category, restricted to the
 * budget's period window when applicable.
 *
 * Rules:
 *   - Match `transactions.tags` (a JSON-encoded text array) against the
 *     budget's category via SQLite `json_each`.
 *   - Exclude transactions with `type = 'Transfer'`.
 *   - Sum the absolute value of negative amounts only — outflows count as
 *     spend; inflows (Income, refunds) do not.
 *   - Restrict to `date >= periodWindowStart` for Monthly/Yearly. All-time
 *     for any other period (including null).
 */
export function computeSpent(
  category: string,
  period: string | null,
  now: Date = new Date()
): number {
  const windowStart = periodWindowStart(period, now);
  const db = getDrizzle();

  // The CASE WHEN amount < 0 THEN -amount ELSE 0 END expression turns a mix of
  // negative outflows and positive inflows into a non-negative spend total
  // without double-counting refunds against the spend.
  const conditions = [
    sql`EXISTS (SELECT 1 FROM json_each(${transactions.tags}) WHERE json_each.value = ${category})`,
    sql`${transactions.type} != 'Transfer'`,
  ];
  if (windowStart !== null) {
    // Monthly/Yearly windows are explicitly *-to-date — clamp the upper
    // bound to today so future-dated transactions never count.
    const windowEnd = periodWindowEnd(now);
    conditions.push(sql`${transactions.date} >= ${windowStart}`);
    conditions.push(sql`${transactions.date} <= ${windowEnd}`);
  }

  const row = db
    .select({
      total: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amount} < 0 THEN -${transactions.amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .get();

  return row?.total ?? 0;
}

/**
 * List budgets with optional filters. Each row is enriched with `spent`
 * (aggregated outflow over the budget's period) and `remaining` (amount −
 * spent, or null when the budget has no target amount).
 */
export function listBudgets(opts: ListBudgetsOptions): BudgetListResult {
  const db = getDrizzle();
  const conditions = [];

  if (opts.search) conditions.push(like(budgets.category, `%${opts.search}%`));
  if (opts.period) conditions.push(eq(budgets.period, opts.period));
  if (opts.active !== undefined) conditions.push(eq(budgets.active, opts.active ? 1 : 0));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const now = opts.now ?? new Date();

  const rows = db
    .select()
    .from(budgets)
    .where(where)
    .orderBy(asc(budgets.category))
    .limit(opts.limit)
    .offset(opts.offset)
    .all();

  const enriched: BudgetWithSpend[] = rows.map((row) => {
    const spent = computeSpent(row.category, row.period, now);
    const remaining = row.amount === null ? null : row.amount - spent;
    return { ...row, spent, remaining };
  });

  const countRow = db.select({ total: count() }).from(budgets).where(where).all()[0];
  return { rows: enriched, total: countRow?.total ?? 0 };
}

/** Get a single budget by id. Throws NotFoundError if missing. */
export function getBudget(id: string): BudgetRow {
  const db = getDrizzle();
  const row = db.select().from(budgets).where(eq(budgets.id, id)).get();

  if (!row) throw new NotFoundError('Budget', id);
  return row;
}

/**
 * Enrich a raw budget row with `spent` and `remaining`. Convenience wrapper
 * used by single-row endpoints (get/create/update) so they return the same
 * shape as the list endpoint.
 */
export function withSpend(row: BudgetRow, now: Date = new Date()): BudgetWithSpend {
  const spent = computeSpent(row.category, row.period, now);
  const remaining = row.amount === null ? null : row.amount - spent;
  return { ...row, spent, remaining };
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
