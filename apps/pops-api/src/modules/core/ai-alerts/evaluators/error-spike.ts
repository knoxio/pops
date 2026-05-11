/**
 * Error-spike rule evaluator (PRD-092 US-07).
 *
 * Counts rows in the rolling window matching the rule's optional provider /
 * model scope and fires a candidate when the error rate (status in
 * `error|timeout`) meets/exceeds the configured percentage.
 */
import { and, eq, gte, sql } from 'drizzle-orm';

import { aiInferenceLog } from '@pops/db-types';

import { rollingWindowStart } from './shared.js';

import type { getDrizzle } from '../../../../db.js';
import type { AlertCandidate, AlertRule, AlertSeverity } from '../types.js';

function severity(rate: number, threshold: number): AlertSeverity {
  return rate >= threshold * 1.5 ? 'critical' : 'warning';
}

export function evaluateErrorSpike(
  rule: AlertRule,
  db: ReturnType<typeof getDrizzle>,
  now: Date
): AlertCandidate[] {
  const windowMinutes = rule.windowMinutes ?? 60;
  const start = rollingWindowStart(now, windowMinutes);
  const conditions = [gte(aiInferenceLog.createdAt, start)];
  const scopeParts: string[] = [];
  if (rule.scopeProvider) {
    conditions.push(eq(aiInferenceLog.provider, rule.scopeProvider));
    scopeParts.push(`provider:${rule.scopeProvider}`);
  }
  if (rule.scopeModel) {
    conditions.push(eq(aiInferenceLog.model, rule.scopeModel));
    scopeParts.push(`model:${rule.scopeModel}`);
  }
  const scopeDetail = scopeParts.length > 0 ? scopeParts.join(',') : 'global';

  const [row] = db
    .select({
      total: sql<number>`COUNT(*)`,
      errors: sql<number>`SUM(CASE WHEN ${aiInferenceLog.status} IN ('error','timeout') THEN 1 ELSE 0 END)`,
    })
    .from(aiInferenceLog)
    .where(and(...conditions))
    .all();
  if (!row || row.total === 0) return [];

  const errorRate = (row.errors / row.total) * 100;
  if (errorRate < rule.thresholdValue) return [];

  return [
    {
      ruleId: rule.id,
      type: 'error-spike',
      severity: severity(errorRate, rule.thresholdValue),
      message: `Error rate ${errorRate.toFixed(1)}% in the last ${windowMinutes} minutes exceeds threshold ${rule.thresholdValue}% (${row.errors}/${row.total} calls)`,
      scopeDetail,
      metricValue: Number(errorRate.toFixed(2)),
      thresholdValue: rule.thresholdValue,
    },
  ];
}
