/**
 * AI budgets module — CRUD + budget status for `core.aiBudgets.*`.
 *
 * Every read and write goes through the relocated `aiUsageService`
 * resolved against the request-scoped core drizzle handle (`ctx.coreDb`),
 * so `listBudgets`, `getBudgetStatus`, and `upsertBudget` all land on
 * `core.db`. Per-budget usage aggregation (`sumInferenceLogUsage`) reads
 * from the same store the inference writes land on, so usage reflects
 * every recorded call immediately — there is no read/write staleness
 * window.
 */
import { aiUsageService, type AiBudgetRow, type AiDb } from '../../../db/index.js';

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
export function listBudgets(db: AiDb): Budget[] {
  return aiUsageService.listBudgets(db);
}

/**
 * WRITE — upsert lands on `core.db` via `aiUsageService.upsertBudget`.
 * Returns the persisted row including the canonicalised `scopeValue`
 * (`null` for global scope regardless of the supplied value).
 */
export function upsertBudget(db: AiDb, input: UpsertBudgetInput): Budget {
  return aiUsageService.upsertBudget(db, {
    id: input.id,
    scopeType: input.scopeType,
    scopeValue: input.scopeValue ?? null,
    monthlyTokenLimit: input.monthlyTokenLimit ?? null,
    monthlyCostLimit: input.monthlyCostLimit ?? null,
    action: input.action,
  });
}

/**
 * READ — budgets come from `aiUsageService.listBudgets`; per-budget usage
 * comes from `aiUsageService.sumInferenceLogUsage` against `core.db`.
 */
export function getBudgetStatus(db: AiDb): BudgetStatus[] {
  const start = monthStart();
  const monthStartDate = new Date(start);
  const budgets = aiUsageService.listBudgets(db);

  return budgets.map((budget) => buildBudgetStatus(db, budget, start, monthStartDate));
}

function getBudgetUsage(
  db: AiDb,
  budget: AiBudgetRow,
  start: string
): { currentTokenUsage: number; currentCostUsage: number } {
  const usage = aiUsageService.sumInferenceLogUsage(db, {
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
  budget: AiBudgetRow,
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

function buildBudgetStatus(
  db: AiDb,
  budget: AiBudgetRow,
  start: string,
  monthStartDate: Date
): BudgetStatus {
  const usage = getBudgetUsage(db, budget, start);
  const fields = computeBudgetStatusFields(budget, usage, monthStartDate);
  return { ...budget, ...usage, ...fields };
}

export {
  evaluateBudgetsForCall,
  findFallbackProvider,
  migrateLegacyBudgetSettings,
} from './enforcement.js';
export type { ApplicableBudget, BudgetBreach } from './enforcement.js';
