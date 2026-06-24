/**
 * Budget CRUD + spend aggregation against finance's SQLite via drizzle.
 *
 * Follows the standard service pattern: db-arg services, typed domain
 * errors, no HTTP concerns.
 */
import { and, asc, count, eq, isNull, like } from 'drizzle-orm';

import { BudgetConflictError, BudgetNotFoundError } from '../errors.js';
import { budgets } from '../schema.js';
import { bulkComputeSpend, spendMapKey } from './budget-spend.js';
import { isBudgetUniqueViolation } from './budget-unique-violation.js';

import type { FinanceDb } from './internal.js';

export { periodWindowEnd, periodWindowStart } from './period-window.js';

/** Raw drizzle row shape. */
export type BudgetRow = typeof budgets.$inferSelect;

/** A budget row plus aggregated spend over its period. */
export interface BudgetWithSpend extends BudgetRow {
  spent: number;
  remaining: number | null;
}

/** Result of a paginated `list` call. */
export interface BudgetListResult {
  rows: BudgetWithSpend[];
  total: number;
}

/** Mutable subset accepted on create. `notionId` stays the import/sync layer's job. */
export interface CreateBudgetInput {
  category: string;
  period?: string | null;
  amount?: number | null;
  active?: boolean;
  notes?: string | null;
}

/** Same shape as create — all fields optional for PATCH semantics. */
export interface UpdateBudgetInput {
  category?: string;
  period?: string | null;
  amount?: number | null;
  active?: boolean;
  notes?: string | null;
}

/** Filters + pagination accepted by `listBudgets`. */
export interface ListBudgetsOptions {
  search?: string | undefined;
  period?: string | undefined;
  active?: boolean | undefined;
  limit: number;
  offset: number;
  /**
   * Reference timestamp used to derive the period window. Defaults to the
   * current time. Override in tests to make the window deterministic.
   */
  now?: Date | undefined;
}

/**
 * Compute the total spent against a budget's category, restricted to the
 * budget's period window when applicable. Delegates to {@link bulkComputeSpend}
 * so the single-row and list paths share the same aggregation SQL.
 */
export function computeSpent(
  db: FinanceDb,
  category: string,
  period: string | null,
  now: Date = new Date()
): number {
  const map = bulkComputeSpend(db, [{ category, period }], now);
  return map.get(spendMapKey(period, category)) ?? 0;
}

/**
 * Enrich a raw budget row with `spent` and `remaining`. Convenience wrapper
 * used by single-row endpoints (get/create/update) so they return the same
 * shape as the list endpoint.
 */
export function withSpend(db: FinanceDb, row: BudgetRow, now: Date = new Date()): BudgetWithSpend {
  const map = bulkComputeSpend(db, [{ category: row.category, period: row.period }], now);
  const spent = map.get(spendMapKey(row.period, row.category)) ?? 0;
  const remaining = row.amount === null ? null : row.amount - spent;
  return { ...row, spent, remaining };
}

/**
 * List budgets with optional filters. Each row is enriched with `spent`
 * (aggregated outflow over the budget's period) and `remaining` (amount −
 * spent, or null when the budget has no target amount).
 */
export function listBudgets(db: FinanceDb, opts: ListBudgetsOptions): BudgetListResult {
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

  const spendMap = bulkComputeSpend(
    db,
    rows.map((r) => ({ category: r.category, period: r.period })),
    now
  );

  const enriched: BudgetWithSpend[] = rows.map((row) => {
    const spent = spendMap.get(spendMapKey(row.period, row.category)) ?? 0;
    const remaining = row.amount === null ? null : row.amount - spent;
    return { ...row, spent, remaining };
  });

  const countRow = db.select({ total: count() }).from(budgets).where(where).all()[0];
  return { rows: enriched, total: countRow?.total ?? 0 };
}

/** Get a single budget by id. Throws `BudgetNotFoundError` if missing. */
export function getBudget(db: FinanceDb, id: string): BudgetRow {
  const row = db.select().from(budgets).where(eq(budgets.id, id)).get();
  if (!row) throw new BudgetNotFoundError(id);
  return row;
}

/**
 * Create a new budget. Returns the persisted row.
 *
 * Throws `BudgetConflictError` if a budget with the same `(category, period)`
 * already exists. The pre-check is the friendly fast path; the UNIQUE
 * constraint mapping on the INSERT is the safety net for concurrent inserts
 * that race past it.
 */
export function createBudget(db: FinanceDb, input: CreateBudgetInput): BudgetRow {
  const period = input.period ?? null;

  const existing = db
    .select({ id: budgets.id })
    .from(budgets)
    .where(
      and(
        eq(budgets.category, input.category),
        period !== null ? eq(budgets.period, period) : isNull(budgets.period)
      )
    )
    .get();

  if (existing) throw new BudgetConflictError(input.category, period);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    db.insert(budgets)
      .values({
        id,
        category: input.category,
        period,
        amount: input.amount ?? null,
        active: input.active ? 1 : 0,
        notes: input.notes ?? null,
        lastEditedTime: now,
      })
      .run();
  } catch (err) {
    if (isBudgetUniqueViolation(err)) {
      throw new BudgetConflictError(input.category, period);
    }
    throw err;
  }

  return getBudget(db, id);
}

function buildBudgetUpdates(input: UpdateBudgetInput): Partial<typeof budgets.$inferInsert> {
  const updates: Partial<typeof budgets.$inferInsert> = {};
  if (input.category !== undefined) updates.category = input.category;
  if (input.period !== undefined) updates.period = input.period ?? null;
  if (input.amount !== undefined) updates.amount = input.amount ?? null;
  if (input.active !== undefined) updates.active = input.active ? 1 : 0;
  if (input.notes !== undefined) updates.notes = input.notes ?? null;
  return updates;
}

/**
 * Patch a budget. Throws `BudgetNotFoundError` if missing. No-op writes
 * (empty `input`) still re-read the row but skip the UPDATE.
 *
 * Patches that would change `(category, period)` into an existing budget's
 * slot map UNIQUE constraint violations to `BudgetConflictError`, using the
 * post-patch values for the error.
 */
export function updateBudget(db: FinanceDb, id: string, input: UpdateBudgetInput): BudgetRow {
  const current = getBudget(db, id);

  const updates = buildBudgetUpdates(input);
  if (Object.keys(updates).length > 0) {
    updates.lastEditedTime = new Date().toISOString();
    const effectiveCategory = input.category ?? current.category;
    const effectivePeriod = input.period !== undefined ? (input.period ?? null) : current.period;

    try {
      db.update(budgets).set(updates).where(eq(budgets.id, id)).run();
    } catch (err) {
      if (isBudgetUniqueViolation(err)) {
        throw new BudgetConflictError(effectiveCategory, effectivePeriod);
      }
      throw err;
    }
  }

  return getBudget(db, id);
}

/** Delete a budget. Throws `BudgetNotFoundError` if missing. */
export function deleteBudget(db: FinanceDb, id: string): void {
  getBudget(db, id);
  const result = db.delete(budgets).where(eq(budgets.id, id)).run();
  if (result.changes === 0) throw new BudgetNotFoundError(id);
}
