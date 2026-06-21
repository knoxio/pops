/**
 * Budget CRUD helpers for `core.aiBudgets.*`.
 *
 * Split out of `ai-usage.ts` so each half stays under the file-size lint
 * cap. The barrel `ai-usage.ts` re-exports everything so consumers see a
 * single `aiUsageService` namespace.
 */
import { eq } from 'drizzle-orm';

import { AiBudgetNotFoundError } from '../errors.js';
import { aiBudgets } from '../schema.js';

import type { AiDb } from './internal.js';

export type AiBudgetRow = typeof aiBudgets.$inferSelect;
export type AiBudgetInsert = typeof aiBudgets.$inferInsert;
export type AiBudget = AiBudgetRow;

/** Input for {@link upsertBudget}. `scopeValue` is required for non-global
 * scopes. `action` defaults to `warn` to match the shared journal. */
export interface UpsertBudgetInput {
  id: string;
  scopeType: 'global' | 'provider' | 'operation';
  scopeValue?: string | null;
  monthlyTokenLimit?: number | null;
  monthlyCostLimit?: number | null;
  action?: 'block' | 'warn' | 'fallback';
}

/** Read all configured budgets in insertion order. */
export function listBudgets(db: AiDb): AiBudgetRow[] {
  return db.select().from(aiBudgets).all();
}

/** Read a single budget by id; returns `null` when absent. */
export function getBudgetOrNull(db: AiDb, id: string): AiBudgetRow | null {
  return db.select().from(aiBudgets).where(eq(aiBudgets.id, id)).get() ?? null;
}

/** Read a single budget by id; throws {@link AiBudgetNotFoundError} when
 * absent. Prefer {@link getBudgetOrNull} when the caller wants to
 * fall back. */
export function getBudget(db: AiDb, id: string): AiBudgetRow {
  const row = getBudgetOrNull(db, id);
  if (!row) throw new AiBudgetNotFoundError(id);
  return row;
}

/**
 * Upsert a budget. Returns the persisted row. The `scopeValue` column is
 * normalised to `null` for the `global` scope so the unique scope key is
 * always `(scope_type, scope_value)`-shaped from the reader's POV.
 */
export function upsertBudget(db: AiDb, input: UpsertBudgetInput): AiBudgetRow {
  const now = new Date().toISOString();
  const scopeValue = input.scopeType === 'global' ? null : (input.scopeValue ?? null);
  const monthlyTokenLimit = input.monthlyTokenLimit ?? null;
  const monthlyCostLimit = input.monthlyCostLimit ?? null;
  const action = input.action ?? 'warn';

  db.insert(aiBudgets)
    .values({
      id: input.id,
      scopeType: input.scopeType,
      scopeValue,
      monthlyTokenLimit,
      monthlyCostLimit,
      action,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiBudgets.id,
      set: {
        scopeType: input.scopeType,
        scopeValue,
        monthlyTokenLimit,
        monthlyCostLimit,
        action,
        updatedAt: now,
      },
    })
    .run();

  return getBudget(db, input.id);
}

/** Delete a budget by id. Throws {@link AiBudgetNotFoundError} when no
 * row matched (`changes === 0`). */
export function deleteBudget(db: AiDb, id: string): void {
  const result = db.delete(aiBudgets).where(eq(aiBudgets.id, id)).run();
  if (result.changes === 0) throw new AiBudgetNotFoundError(id);
}
