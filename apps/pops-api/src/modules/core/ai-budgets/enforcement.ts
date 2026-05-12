/**
 * Pre-call budget enforcement helpers (PRD-092 US-04).
 *
 * Split out of `service.ts` so the read-side CRUD/status code (mounted on
 * `core.aiBudgets`) and the inference-middleware enforcement path can each
 * stay under the project's max-lines lint budget.
 */
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';

import { aiBudgets, aiInferenceLog, aiModelPricing, aiProviders } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { logger } from '../../../lib/logger.js';
import { getSettingOrNull, setRawSetting } from '../settings/service.js';
import { upsertBudget } from './service.js';

/**
 * A single applicable budget for a (provider, operation) pair, evaluated
 * against the current calendar month. `currentTokenUsage` / `currentCostUsage`
 * are summed via a single aggregate query per scope.
 */
export interface ApplicableBudget {
  id: string;
  scopeType: string;
  scopeValue: string | null;
  monthlyTokenLimit: number | null;
  monthlyCostLimit: number | null;
  action: string;
  currentTokenUsage: number;
  currentCostUsage: number;
}

/**
 * One limit (cost or token) that a budget has currently exceeded. Cost takes
 * priority when both limits are set and both are over.
 */
export interface BudgetBreach {
  budget: ApplicableBudget;
  limitType: 'cost' | 'token';
  currentUsage: number;
  limit: number;
}

type BudgetRow = typeof aiBudgets.$inferSelect;

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function getUsageForScope(
  db: ReturnType<typeof getDrizzle>,
  row: BudgetRow,
  start: string
): { currentTokenUsage: number; currentCostUsage: number } {
  const conditions = [gte(aiInferenceLog.createdAt, start)];
  if (row.scopeType === 'provider' && row.scopeValue) {
    conditions.push(eq(aiInferenceLog.provider, row.scopeValue));
  } else if (row.scopeType === 'operation' && row.scopeValue) {
    conditions.push(eq(aiInferenceLog.operation, row.scopeValue));
  }
  const [agg] = db
    .select({
      totalTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens} + ${aiInferenceLog.outputTokens}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
    })
    .from(aiInferenceLog)
    .where(and(...conditions))
    .all();
  return {
    currentTokenUsage: agg?.totalTokens ?? 0,
    currentCostUsage: agg?.totalCost ?? 0,
  };
}

function listApplicableBudgets(provider: string, operation: string): ApplicableBudget[] {
  const db = getDrizzle();
  const rows = db
    .select()
    .from(aiBudgets)
    .where(
      sql`(${aiBudgets.scopeType} = 'global')
        OR (${aiBudgets.scopeType} = 'provider' AND ${aiBudgets.scopeValue} = ${provider})
        OR (${aiBudgets.scopeType} = 'operation' AND ${aiBudgets.scopeValue} = ${operation})`
    )
    .all();
  if (rows.length === 0) return [];
  const start = monthStart();
  const usageByScope = new Map<string, { currentTokenUsage: number; currentCostUsage: number }>();
  return rows.map((row) => {
    const scopeKey = `${row.scopeType}:${row.scopeValue ?? ''}`;
    let usage = usageByScope.get(scopeKey);
    if (!usage) {
      usage = getUsageForScope(db, row, start);
      usageByScope.set(scopeKey, usage);
    }
    return {
      id: row.id,
      scopeType: row.scopeType,
      scopeValue: row.scopeValue,
      monthlyTokenLimit: row.monthlyTokenLimit,
      monthlyCostLimit: row.monthlyCostLimit,
      action: row.action,
      currentTokenUsage: usage.currentTokenUsage,
      currentCostUsage: usage.currentCostUsage,
    };
  });
}

function evaluateBreach(budget: ApplicableBudget): BudgetBreach | null {
  if (
    budget.monthlyCostLimit != null &&
    budget.monthlyCostLimit > 0 &&
    budget.currentCostUsage >= budget.monthlyCostLimit
  ) {
    return {
      budget,
      limitType: 'cost',
      currentUsage: budget.currentCostUsage,
      limit: budget.monthlyCostLimit,
    };
  }
  if (
    budget.monthlyTokenLimit != null &&
    budget.monthlyTokenLimit > 0 &&
    budget.currentTokenUsage >= budget.monthlyTokenLimit
  ) {
    return {
      budget,
      limitType: 'token',
      currentUsage: budget.currentTokenUsage,
      limit: budget.monthlyTokenLimit,
    };
  }
  return null;
}

/**
 * Resolve every applicable budget for a (provider, operation) call and return
 * any that are at-or-over their configured limit. Used by the inference
 * middleware to decide whether to block, warn, or fall back before the
 * provider call.
 */
export function evaluateBudgetsForCall(
  provider: string,
  operation: string
): { breaches: BudgetBreach[]; allBudgets: ApplicableBudget[] } {
  let allBudgets: ApplicableBudget[];
  try {
    allBudgets = listApplicableBudgets(provider, operation);
  } catch (err) {
    logger.warn({ err, provider, operation }, '[ai-budgets] failed to read budgets — failing open');
    return { breaches: [], allBudgets: [] };
  }
  const breaches: BudgetBreach[] = [];
  for (const b of allBudgets) {
    const breach = evaluateBreach(b);
    if (breach) breaches.push(breach);
  }
  return { breaches, allBudgets };
}

const LEGACY_TOKEN_BUDGET_KEY = 'ai.monthlyTokenBudget';
const LEGACY_FALLBACK_KEY = 'ai.budgetExceededFallback';
const LEGACY_MIGRATED_FLAG_KEY = 'ai.budgetSettingsMigrated';

function mapLegacyFallbackToAction(raw: string | null): 'block' | 'warn' {
  if (raw === 'skip') return 'block';
  if (raw === 'alert') return 'warn';
  return 'warn';
}

/**
 * Idempotent startup migration from legacy `ai.monthlyTokenBudget` /
 * `ai.budgetExceededFallback` settings into a global `ai_budgets` row.
 * Runs at most once per database (gated by `ai.budgetSettingsMigrated`); also
 * skips when a global budget row already exists, so re-running on a populated
 * deployment is a no-op.
 */
export function migrateLegacyBudgetSettings(): void {
  if (getSettingOrNull(LEGACY_MIGRATED_FLAG_KEY)) return;

  const db = getDrizzle();
  // Skip if either: a global-scoped row already exists, or a row with id='global'
  // already exists under a different scope. upsertBudget keys on id, so the
  // latter would silently clobber unrelated data.
  const conflict = db
    .select({ id: aiBudgets.id })
    .from(aiBudgets)
    .where(sql`${aiBudgets.scopeType} = 'global' OR ${aiBudgets.id} = 'global'`)
    .get();
  if (conflict) {
    setRawSetting(LEGACY_MIGRATED_FLAG_KEY, '1');
    return;
  }

  const tokenSetting = getSettingOrNull(LEGACY_TOKEN_BUDGET_KEY);
  const fallbackSetting = getSettingOrNull(LEGACY_FALLBACK_KEY);
  if (!tokenSetting && !fallbackSetting) {
    setRawSetting(LEGACY_MIGRATED_FLAG_KEY, '1');
    return;
  }

  const parsedTokenLimit = tokenSetting ? Number(tokenSetting.value) : NaN;
  const monthlyTokenLimit =
    Number.isFinite(parsedTokenLimit) && parsedTokenLimit > 0 ? parsedTokenLimit : undefined;
  const action = mapLegacyFallbackToAction(fallbackSetting?.value ?? null);

  upsertBudget({
    id: 'global',
    scopeType: 'global',
    monthlyTokenLimit,
    action,
  });
  setRawSetting(LEGACY_MIGRATED_FLAG_KEY, '1');
}

/**
 * Lookup an active local provider for `action='fallback'` budgets. Returns
 * the first active local provider together with its default model. Returns
 * `null` when no candidate is available — the middleware then treats fallback
 * as block.
 */
export function findFallbackProvider(): { provider: string; model: string } | null {
  const db = getDrizzle();
  const row = db
    .select({
      providerId: aiProviders.id,
      modelId: aiModelPricing.modelId,
    })
    .from(aiProviders)
    .innerJoin(aiModelPricing, eq(aiModelPricing.providerId, aiProviders.id))
    .where(and(eq(aiProviders.type, 'local'), eq(aiProviders.status, 'active')))
    .orderBy(asc(aiProviders.id), desc(aiModelPricing.isDefault), asc(aiModelPricing.modelId))
    .get();
  if (!row) return null;
  return { provider: row.providerId, model: row.modelId };
}
