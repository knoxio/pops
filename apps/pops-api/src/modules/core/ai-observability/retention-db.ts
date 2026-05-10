import type BetterSqlite3 from 'better-sqlite3';

/**
 * SQL helpers for the AI inference log retention job (PRD-092 US-08).
 * Split from `retention.ts` to keep both files under the file-size lint cap.
 */
import type { DailyAggregate, RetentionInputRow } from './retention-types.js';

interface RawInferenceRow {
  id: number;
  created_at: string;
  provider: string;
  model: string;
  operation: string;
  domain: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status: string;
  cached: number;
}

export function fetchAgedBatch(
  db: BetterSqlite3.Database,
  cutoffIso: string,
  batchSize: number
): Array<{ id: number; row: RetentionInputRow }> {
  const raw = db
    .prepare(
      `SELECT id, created_at, provider, model, operation, domain,
              input_tokens, output_tokens, cost_usd, latency_ms, status, cached
       FROM ai_inference_log
       WHERE created_at < ?
       ORDER BY id
       LIMIT ?`
    )
    .all(cutoffIso, batchSize) as RawInferenceRow[];

  return raw.map((r) => ({
    id: r.id,
    row: {
      createdAt: r.created_at,
      provider: r.provider,
      model: r.model,
      operation: r.operation,
      domain: r.domain,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costUsd: r.cost_usd,
      latencyMs: r.latency_ms,
      status: r.status,
      cached: r.cached,
    },
  }));
}

/**
 * Upsert an aggregate row, merging with any existing row with the same
 * natural key. SQLite's `ON CONFLICT` clause keys off the unique index
 * `idx_ai_inference_daily_key`. Existing `avg_latency_ms` is folded into
 * the new value using a weighted mean against `total_calls` — close enough
 * for trend lines (the daily table is for trends, not exact replays).
 */
export function upsertAggregate(db: BetterSqlite3.Database, agg: DailyAggregate): void {
  db.prepare(
    `INSERT INTO ai_inference_daily (
        date, provider, model, operation, domain,
        total_calls, total_input_tokens, total_output_tokens, total_cost_usd,
        avg_latency_ms, error_count, timeout_count, cache_hit_count, budget_blocked_count
     ) VALUES (
        @date, @provider, @model, @operation, @domain,
        @total_calls, @total_input_tokens, @total_output_tokens, @total_cost_usd,
        @avg_latency_ms, @error_count, @timeout_count, @cache_hit_count, @budget_blocked_count
     )
     ON CONFLICT(date, provider, model, operation, domain) DO UPDATE SET
        total_calls = total_calls + excluded.total_calls,
        total_input_tokens = total_input_tokens + excluded.total_input_tokens,
        total_output_tokens = total_output_tokens + excluded.total_output_tokens,
        total_cost_usd = total_cost_usd + excluded.total_cost_usd,
        avg_latency_ms = CASE
          WHEN (total_calls + excluded.total_calls) = 0 THEN 0
          ELSE CAST(
            (avg_latency_ms * total_calls + excluded.avg_latency_ms * excluded.total_calls)
            / (total_calls + excluded.total_calls)
            AS INTEGER
          )
        END,
        error_count = error_count + excluded.error_count,
        timeout_count = timeout_count + excluded.timeout_count,
        cache_hit_count = cache_hit_count + excluded.cache_hit_count,
        budget_blocked_count = budget_blocked_count + excluded.budget_blocked_count`
  ).run({
    date: agg.date,
    provider: agg.provider,
    model: agg.model,
    operation: agg.operation,
    domain: agg.domain,
    total_calls: agg.totalCalls,
    total_input_tokens: agg.totalInputTokens,
    total_output_tokens: agg.totalOutputTokens,
    total_cost_usd: agg.totalCostUsd,
    avg_latency_ms: agg.avgLatencyMs,
    error_count: agg.errorCount,
    timeout_count: agg.timeoutCount,
    cache_hit_count: agg.cacheHitCount,
    budget_blocked_count: agg.budgetBlockedCount,
  });
}

export function deleteRowsByIds(db: BetterSqlite3.Database, ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM ai_inference_log WHERE id IN (${placeholders})`).run(...ids);
}
