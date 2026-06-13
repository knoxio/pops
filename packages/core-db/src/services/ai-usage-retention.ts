/**
 * Retention/rollup helpers for the AI inference log slice.
 *
 * Split out of `ai-usage.ts` so each half stays under the file-size lint
 * cap. The barrel re-exports everything so consumers see a single
 * `aiUsageService` namespace.
 *
 * Covers:
 *   - `fetchAgedInferenceLogs` — projection over the columns the retention
 *     aggregator consumes, ordered by id so consecutive batches make
 *     forward progress.
 *   - `recordInferenceDaily` — natural-key upsert into `ai_inference_daily`
 *     that folds counters into any existing row and merges latency via a
 *     weighted mean.
 *   - `deleteInferenceLogsByIds` — bulk delete on the source table after
 *     the aggregates have been folded in.
 */
import { inArray, lte, sql } from 'drizzle-orm';

import { aiInferenceDaily, aiInferenceLog } from '../schema.js';

import type { CoreDb } from './internal.js';

/**
 * Subset of `ai_inference_log` columns the retention aggregator consumes.
 * Exposed so callers can build batches in their own pipeline before
 * handing them off to {@link recordInferenceDaily}.
 */
export interface InferenceLogRetentionRow {
  createdAt: string;
  provider: string;
  model: string;
  operation: string;
  domain: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: string;
  cached: number;
}

/**
 * Daily aggregate row written by the retention rollup. Keys + counters
 * for one `(date, provider, model, operation, domain)` bucket.
 */
export interface InferenceDailyAggregate {
  date: string;
  provider: string;
  model: string;
  operation: string;
  domain: string | null;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  errorCount: number;
  timeoutCount: number;
  cacheHitCount: number;
  budgetBlockedCount: number;
}

/**
 * Fetch the next batch of `ai_inference_log` rows older than `cutoffIso`
 * for retention rollup. Returns each row's `id` alongside the projected
 * columns the aggregator consumes. Ordered by `id` so consecutive batches
 * progress monotonically through the table.
 */
export function fetchAgedInferenceLogs(
  db: CoreDb,
  cutoffIso: string,
  batchSize: number
): Array<{ id: number; row: InferenceLogRetentionRow }> {
  const rows = db
    .select({
      id: aiInferenceLog.id,
      createdAt: aiInferenceLog.createdAt,
      provider: aiInferenceLog.provider,
      model: aiInferenceLog.model,
      operation: aiInferenceLog.operation,
      domain: aiInferenceLog.domain,
      inputTokens: aiInferenceLog.inputTokens,
      outputTokens: aiInferenceLog.outputTokens,
      costUsd: aiInferenceLog.costUsd,
      latencyMs: aiInferenceLog.latencyMs,
      status: aiInferenceLog.status,
      cached: aiInferenceLog.cached,
    })
    .from(aiInferenceLog)
    .where(lte(aiInferenceLog.createdAt, cutoffIso))
    .orderBy(aiInferenceLog.id)
    .limit(batchSize)
    .all();

  return rows.map((r) => ({
    id: r.id,
    row: {
      createdAt: r.createdAt,
      provider: r.provider,
      model: r.model,
      operation: r.operation,
      domain: r.domain,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: r.costUsd,
      latencyMs: r.latencyMs,
      status: r.status,
      cached: r.cached,
    },
  }));
}

/**
 * Upsert one daily aggregate row, folding the new counters into any
 * existing row keyed by `(date, provider, model, operation, domain)` via
 * `idx_ai_inference_daily_key`. Existing `avg_latency_ms` is merged using
 * a weighted mean against `total_calls`. Used by the retention rollup;
 * idempotent against re-running over the same source rows because the
 * caller deletes the source on success.
 */
export function recordInferenceDaily(db: CoreDb, agg: InferenceDailyAggregate): void {
  db.insert(aiInferenceDaily)
    .values({
      date: agg.date,
      provider: agg.provider,
      model: agg.model,
      operation: agg.operation,
      domain: agg.domain,
      totalCalls: agg.totalCalls,
      totalInputTokens: agg.totalInputTokens,
      totalOutputTokens: agg.totalOutputTokens,
      totalCostUsd: agg.totalCostUsd,
      avgLatencyMs: agg.avgLatencyMs,
      errorCount: agg.errorCount,
      timeoutCount: agg.timeoutCount,
      cacheHitCount: agg.cacheHitCount,
      budgetBlockedCount: agg.budgetBlockedCount,
    })
    .onConflictDoUpdate({
      target: [
        aiInferenceDaily.date,
        aiInferenceDaily.provider,
        aiInferenceDaily.model,
        aiInferenceDaily.operation,
        aiInferenceDaily.domain,
      ],
      set: {
        totalCalls: sql`${aiInferenceDaily.totalCalls} + excluded.total_calls`,
        totalInputTokens: sql`${aiInferenceDaily.totalInputTokens} + excluded.total_input_tokens`,
        totalOutputTokens: sql`${aiInferenceDaily.totalOutputTokens} + excluded.total_output_tokens`,
        totalCostUsd: sql`${aiInferenceDaily.totalCostUsd} + excluded.total_cost_usd`,
        avgLatencyMs: sql`CASE
          WHEN (${aiInferenceDaily.totalCalls} + excluded.total_calls) = 0 THEN 0
          ELSE CAST(
            (${aiInferenceDaily.avgLatencyMs} * ${aiInferenceDaily.totalCalls} + excluded.avg_latency_ms * excluded.total_calls)
            / (${aiInferenceDaily.totalCalls} + excluded.total_calls)
            AS INTEGER
          )
        END`,
        errorCount: sql`${aiInferenceDaily.errorCount} + excluded.error_count`,
        timeoutCount: sql`${aiInferenceDaily.timeoutCount} + excluded.timeout_count`,
        cacheHitCount: sql`${aiInferenceDaily.cacheHitCount} + excluded.cache_hit_count`,
        budgetBlockedCount: sql`${aiInferenceDaily.budgetBlockedCount} + excluded.budget_blocked_count`,
      },
    })
    .run();
}

/**
 * Delete `ai_inference_log` rows by id list. No-op when `ids` is empty.
 * Used by the retention rollup after the aggregates have been folded in.
 */
export function deleteInferenceLogsByIds(db: CoreDb, ids: number[]): void {
  if (ids.length === 0) return;
  db.delete(aiInferenceLog).where(inArray(aiInferenceLog.id, ids)).run();
}
