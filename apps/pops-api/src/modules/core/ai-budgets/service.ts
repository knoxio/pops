/**
 * AI budgets module — CRUD + budget status for `core.aiBudgets.*`.
 *
 * Read/write split (PRD-186 PR 2 cutover): the pure read surface forwards
 * into `@pops/core-db`'s `aiUsageService` against `getCoreDrizzle()`, so
 * `listBudgets` and `getBudgetStatus` resolve against `core.db`.
 * Mutations (`upsertBudget`) still land via the shared `getDrizzle()`
 * handle — the legacy `pops.db -> core.db` boot-time backfill bridges the
 * gap until PRD-186 PR 3 flips the writer too. This matches the
 * watch-history cutover precedent (PR #3008).
 */
import { aiBudgets, aiUsageService } from '@pops/core-db';

import { getCoreDrizzle, getDrizzle } from '../../../db.js';

export interface Budget {
  id: string;
  scopeType: string;
  scopeValue: string | null;
  monthlyTokenLimit: number | null;
  monthlyCostLimit: number | null;
  action: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetStatus extends Budget {
  currentTokenUsage: number;
  currentCostUsage: number;
  percentageUsed: number | null;
  projectedExhaustionDate: string | null;
}

export interface UpsertBudgetInput {
  id: string;
  scopeType: 'global' | 'provider' | 'operation';
  scopeValue?: string;
  monthlyTokenLimit?: number;
  monthlyCostLimit?: number;
  action?: 'block' | 'warn' | 'fallback';
}

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function computeProjectedExhaustion(
  currentUsage: number,
  limit: number,
  monthStartDate: Date
): string | null {
  if (currentUsage <= 0) return null;
  const now = new Date();
  const dayOfMonth = now.getDate();
  const exhaustionDay = limit / (currentUsage / dayOfMonth);
  if (!isFinite(exhaustionDay) || exhaustionDay <= dayOfMonth) return null;
  const year = monthStartDate.getFullYear();
  const month = monthStartDate.getMonth();
  const exhaustionDate = new Date(year, month, Math.ceil(exhaustionDay));
  if (exhaustionDate.getFullYear() > 9999) return null;
  return exhaustionDate.toISOString().split('T')[0] ?? null;
}

/**
 * READ — forwards to `aiUsageService.listBudgets` against `core.db`.
 */
export function listBudgets(): Budget[] {
  return aiUsageService.listBudgets(getCoreDrizzle());
}

/**
 * WRITE — upsert lands on the shared `pops.db` via `getDrizzle()`. The
 * boot-time `pops.db -> core.db` backfill propagates the new row to the
 * read store on the next boot. PRD-186 PR 3 flips this to `core.db`.
 */
export function upsertBudget(input: UpsertBudgetInput): Budget {
  const now = new Date().toISOString();
  const db = getDrizzle();
  db.insert(aiBudgets)
    .values({
      id: input.id,
      scopeType: input.scopeType,
      scopeValue: input.scopeValue ?? null,
      monthlyTokenLimit: input.monthlyTokenLimit ?? null,
      monthlyCostLimit: input.monthlyCostLimit ?? null,
      action: input.action ?? 'warn',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiBudgets.id,
      set: {
        scopeType: input.scopeType,
        scopeValue: input.scopeValue ?? null,
        monthlyTokenLimit: input.monthlyTokenLimit ?? null,
        monthlyCostLimit: input.monthlyCostLimit ?? null,
        action: input.action ?? 'warn',
        updatedAt: now,
      },
    })
    .run();
  const row = aiUsageService.getBudgetOrNull(getCoreDrizzle(), input.id);
  if (!row) throw new Error(`Budget not found: ${input.id}`);
  return row;
}

/**
 * READ — budgets come from `aiUsageService.listBudgets`; per-budget usage
 * comes from `aiUsageService.sumInferenceLogUsage` against `core.db` so
 * both the budget row and its rolled-up monthly usage stay on the same
 * read handle.
 */
export function getBudgetStatus(): BudgetStatus[] {
  const start = monthStart();
  const monthStartDate = new Date(start);
  const budgets = aiUsageService.listBudgets(getCoreDrizzle());

  return budgets.map((budget) => buildBudgetStatus(budget, start, monthStartDate));
}

type BudgetRow = typeof aiBudgets.$inferSelect;

function getBudgetUsage(
  budget: BudgetRow,
  start: string
): { currentTokenUsage: number; currentCostUsage: number } {
  const usage = aiUsageService.sumInferenceLogUsage(getCoreDrizzle(), {
    since: start,
    ...(budget.scopeType === 'provider' && budget.scopeValue
      ? { provider: budget.scopeValue }
      : {}),
    ...(budget.scopeType === 'operation' && budget.scopeValue
      ? { operation: budget.scopeValue }
      : {}),
  });
  return {
    currentTokenUsage: usage.totalInputTokens + usage.totalOutputTokens,
    currentCostUsage: usage.totalCostUsd,
  };
}

function computeBudgetStatusFields(
  budget: BudgetRow,
  usage: { currentTokenUsage: number; currentCostUsage: number },
  monthStartDate: Date
): { percentageUsed: number | null; projectedExhaustionDate: string | null } {
  if (budget.monthlyCostLimit != null && budget.monthlyCostLimit > 0) {
    return {
      percentageUsed: (usage.currentCostUsage / budget.monthlyCostLimit) * 100,
      projectedExhaustionDate: computeProjectedExhaustion(
        usage.currentCostUsage,
        budget.monthlyCostLimit,
        monthStartDate
      ),
    };
  }
  if (budget.monthlyTokenLimit != null && budget.monthlyTokenLimit > 0) {
    return {
      percentageUsed: (usage.currentTokenUsage / budget.monthlyTokenLimit) * 100,
      projectedExhaustionDate: computeProjectedExhaustion(
        usage.currentTokenUsage,
        budget.monthlyTokenLimit,
        monthStartDate
      ),
    };
  }
  return { percentageUsed: null, projectedExhaustionDate: null };
}

function buildBudgetStatus(budget: BudgetRow, start: string, monthStartDate: Date): BudgetStatus {
  const usage = getBudgetUsage(budget, start);
  const fields = computeBudgetStatusFields(budget, usage, monthStartDate);
  return { ...budget, ...usage, ...fields };
}

export {
  evaluateBudgetsForCall,
  findFallbackProvider,
  migrateLegacyBudgetSettings,
} from './enforcement.js';
export type { ApplicableBudget, BudgetBreach } from './enforcement.js';
