/**
 * Latency-degradation rule evaluator (PRD-092 US-07).
 *
 * Computes the P95 latency for each model in the rolling window (filtered to
 * `success` + non-cached + latencyMs > 0) and fires a candidate per model
 * whose P95 meets/exceeds the rule's threshold. When `scopeModel` is set the
 * evaluator skips the fan-out and only considers that model.
 */
import { and, eq, gte, sql, type SQL } from 'drizzle-orm';

import { aiInferenceLog, type CoreDb } from '../../../../db/index.js';
import { rollingWindowStart } from './shared.js';

import type { AlertCandidate, AlertRule, AlertSeverity } from '../types.js';

/**
 * Nearest-rank percentile. The previous implementation used
 * `Math.floor(p * n)` which selects the *max* element for common sample
 * sizes (e.g. `p=0.95`, `n=20` → idx 19), overstating P95 and producing
 * false-positive alerts. We use the standard nearest-rank formula:
 * `ceil(p * n) - 1`, clamped to the array bounds.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const clampedP = Math.min(Math.max(p, 0), 1);
  const rank = Math.ceil(clampedP * sorted.length) - 1;
  const idx = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[idx] ?? 0;
}

function severity(p95: number, threshold: number): AlertSeverity {
  return p95 >= threshold * 1.5 ? 'critical' : 'warning';
}

function baseLatencyConditions(rule: AlertRule, start: string): SQL[] {
  const conditions: SQL[] = [
    gte(aiInferenceLog.createdAt, start),
    eq(aiInferenceLog.status, 'success'),
    eq(aiInferenceLog.cached, 0),
    sql`${aiInferenceLog.latencyMs} > 0`,
  ];
  if (rule.scopeProvider) {
    conditions.push(eq(aiInferenceLog.provider, rule.scopeProvider));
  }
  return conditions;
}

function evaluateForModel(
  rule: AlertRule,
  db: CoreDb,
  now: Date,
  model: string
): AlertCandidate | null {
  const windowMinutes = rule.windowMinutes ?? 60;
  const start = rollingWindowStart(now, windowMinutes);
  const conditions = [...baseLatencyConditions(rule, start), eq(aiInferenceLog.model, model)];
  const latencies = db
    .select({ latencyMs: aiInferenceLog.latencyMs })
    .from(aiInferenceLog)
    .where(and(...conditions))
    .orderBy(aiInferenceLog.latencyMs)
    .all()
    .map((r) => r.latencyMs);
  if (latencies.length === 0) return null;
  const p95 = percentile(latencies, 0.95);
  if (p95 < rule.thresholdValue) return null;
  return {
    ruleId: rule.id,
    type: 'latency-degradation',
    severity: severity(p95, rule.thresholdValue),
    message: `P95 latency for ${model} is ${p95}ms in the last ${windowMinutes} minutes (threshold: ${rule.thresholdValue}ms, ${latencies.length} samples)`,
    scopeDetail: `model:${model}`,
    metricValue: p95,
    thresholdValue: rule.thresholdValue,
  };
}

function listModelsInWindow(rule: AlertRule, db: CoreDb, now: Date): string[] {
  const windowMinutes = rule.windowMinutes ?? 60;
  const start = rollingWindowStart(now, windowMinutes);
  return db
    .select({ model: aiInferenceLog.model })
    .from(aiInferenceLog)
    .where(and(...baseLatencyConditions(rule, start)))
    .groupBy(aiInferenceLog.model)
    .all()
    .map((r) => r.model);
}

export function evaluateLatencyDegradation(
  rule: AlertRule,
  db: CoreDb,
  now: Date
): AlertCandidate[] {
  if (rule.scopeModel) {
    const candidate = evaluateForModel(rule, db, now, rule.scopeModel);
    return candidate ? [candidate] : [];
  }
  const candidates: AlertCandidate[] = [];
  for (const model of listModelsInWindow(rule, db, now)) {
    const candidate = evaluateForModel(rule, db, now, model);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}
