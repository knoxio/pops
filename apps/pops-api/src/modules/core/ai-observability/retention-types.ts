/**
 * Type declarations for the inference log retention job (PRD-092 US-08).
 *
 * Kept in their own module to avoid an import cycle between the main
 * `retention` orchestrator and the SQL helpers in `retention-db`.
 */

/** Natural aggregation key — one daily row per tuple. */
export interface DailyAggregateKey {
  date: string;
  provider: string;
  model: string;
  operation: string;
  /** `null` means cross-domain — stored as NULL in the raw table. */
  domain: string | null;
}

export interface DailyAggregate extends DailyAggregateKey {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  /** Mean latency over `success`, non-cached rows with `latency_ms > 0`.
   *  Returns 0 when no qualifying rows exist for the bucket. */
  avgLatencyMs: number;
  errorCount: number;
  timeoutCount: number;
  cacheHitCount: number;
  budgetBlockedCount: number;
}

/** Subset of `ai_inference_log` columns the aggregator actually consumes. */
export interface RetentionInputRow {
  /** ISO 8601 timestamp — only the `YYYY-MM-DD` prefix is used. */
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

export interface RetentionResult {
  /** Number of raw `ai_inference_log` rows aggregated and deleted. */
  rowsAggregated: number;
  /** Number of distinct daily buckets touched (one per natural key). */
  bucketsWritten: number;
  /** Number of batch loops executed (>= 1 unless there were no rows to start). */
  batches: number;
  /** Cutoff timestamp used for this run. */
  cutoff: string;
}
