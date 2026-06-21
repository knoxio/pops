/**
 * Budget-threshold rule evaluator (PRD-092 US-07).
 *
 * Iterates every configured `ai_budgets` row, computes current-month usage
 * against the row's cost or token limit, and fires a candidate when the
 * usage percentage meets/exceeds the rule's threshold. Severity steps up to
 * `critical` at 95%.
 */
import { and, eq, gte, sql } from 'drizzle-orm';

import { aiBudgets, aiInferenceLog, type AiDb } from '../../../../db/index.js';

import type { AlertCandidate, AlertRule, AlertSeverity } from '../types.js';

interface BudgetMetrics {
  percentage: number;
  limitDescription: string;
  usedDescription: string;
}

function severity(percentage: number): AlertSeverity {
  return percentage >= 95 ? 'critical' : 'warning';
}

function monthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function getUsage(
  db: AiDb,
  budget: typeof aiBudgets.$inferSelect,
  start: string
): { totalTokens: number; totalCost: number } {
  const conditions = [gte(aiInferenceLog.createdAt, start)];
  if (budget.scopeType === 'provider' && budget.scopeValue) {
    conditions.push(eq(aiInferenceLog.provider, budget.scopeValue));
  } else if (budget.scopeType === 'operation' && budget.scopeValue) {
    conditions.push(eq(aiInferenceLog.operation, budget.scopeValue));
  }
  const [agg] = db
    .select({
      totalTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens} + ${aiInferenceLog.outputTokens}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
    })
    .from(aiInferenceLog)
    .where(and(...conditions))
    .all();
  return { totalTokens: agg?.totalTokens ?? 0, totalCost: agg?.totalCost ?? 0 };
}

/**
 * Build a metric per configured limit. A budget may set both cost and token
 * limits; we must report on whichever is most utilised so a runaway token
 * count never hides behind a comfortable dollar spend (and vice versa).
 */
function computeMetrics(
  budget: typeof aiBudgets.$inferSelect,
  usage: { totalTokens: number; totalCost: number }
): BudgetMetrics | null {
  const metrics: BudgetMetrics[] = [];
  if (budget.monthlyCostLimit != null && budget.monthlyCostLimit > 0) {
    metrics.push({
      percentage: (usage.totalCost / budget.monthlyCostLimit) * 100,
      limitDescription: `$${budget.monthlyCostLimit.toFixed(2)} monthly cost limit`,
      usedDescription: `$${usage.totalCost.toFixed(2)} spent`,
    });
  }
  if (budget.monthlyTokenLimit != null && budget.monthlyTokenLimit > 0) {
    metrics.push({
      percentage: (usage.totalTokens / budget.monthlyTokenLimit) * 100,
      limitDescription: `${budget.monthlyTokenLimit} monthly token limit`,
      usedDescription: `${usage.totalTokens} tokens used`,
    });
  }
  if (metrics.length === 0) return null;
  return metrics.reduce((max, m) => (m.percentage > max.percentage ? m : max));
}

export function evaluateBudgetThreshold(rule: AlertRule, db: AiDb, now: Date): AlertCandidate[] {
  const budgets = db.select().from(aiBudgets).all();
  if (budgets.length === 0) return [];
  const start = monthStart(now);
  const candidates: AlertCandidate[] = [];

  for (const budget of budgets) {
    const usage = getUsage(db, budget, start);
    const metrics = computeMetrics(budget, usage);
    if (!metrics) continue;
    if (metrics.percentage < rule.thresholdValue) continue;

    candidates.push({
      ruleId: rule.id,
      type: 'budget-threshold',
      severity: severity(metrics.percentage),
      message: `Budget '${budget.id}' is at ${metrics.percentage.toFixed(1)}% of its ${metrics.limitDescription} (${metrics.usedDescription})`,
      scopeDetail: `budget:${budget.id}`,
      metricValue: Number(metrics.percentage.toFixed(2)),
      thresholdValue: rule.thresholdValue,
    });
  }
  return candidates;
}
