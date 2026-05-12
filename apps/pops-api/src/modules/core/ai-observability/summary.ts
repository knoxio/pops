/**
 * Daily observability summary job (PRD-092 US-05).
 *
 * Aggregates the last 30 days of `ai_inference_log` rows into a single JSON
 * blob and stores it under settings key `ai.observabilitySummary`. The
 * dashboard reads this row for fast first-paint instead of re-running the
 * heavier aggregation queries on every load.
 *
 * Pure-ish service:
 *  - `computeSummary` is a deterministic function over a SQLite handle and
 *    is what the unit tests exercise.
 *  - `runSummary` is the worker entry point — it calls `computeSummary` and
 *    persists the result via `setRawSetting`.
 */
import { getDb } from '../../../db.js';
import { logger } from '../../../lib/logger.js';
import { setRawSetting } from '../settings/service.js';

import type BetterSqlite3 from 'better-sqlite3';

/** Settings key the dashboard reads to skip live aggregation. */
export const OBSERVABILITY_SUMMARY_SETTING_KEY = 'ai.observabilitySummary';

/** Rolling window in days. */
export const SUMMARY_WINDOW_DAYS = 30;

export interface ProviderBreakdown {
  provider: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ModelBreakdown {
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Mean latency over `success` non-cached rows with `latency_ms > 0`. 0 when none. */
  avgLatencyMs: number;
}

export interface ObservabilitySummary {
  /** Inclusive lower bound (ISO) for the window. */
  windowStart: string;
  /** Exclusive upper bound (ISO) for the window — i.e. "now". */
  windowEnd: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  /** Fraction in [0,1]; 0 when no calls. */
  cacheHitRate: number;
  /** Fraction in [0,1] across `error|timeout|budget-blocked` rows; 0 when no calls. */
  errorRate: number;
  byProvider: ProviderBreakdown[];
  byModel: ModelBreakdown[];
}

export interface ObservabilitySummaryEnvelope extends ObservabilitySummary {
  computedAt: string;
}

interface OverallRow {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  cache_hits: number;
  errors: number;
}

interface ProviderRow {
  provider: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

interface ModelRow {
  provider: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  /** SQLite returns NULL for AVG over an empty set; coerced to 0 below. */
  avg_latency_ms: number | null;
}

function fetchOverall(db: BetterSqlite3.Database, windowStartIso: string): OverallRow {
  const row = db
    .prepare(
      `SELECT
          COUNT(*) AS total_calls,
          COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
          COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
          COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
          SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END) AS cache_hits,
          SUM(CASE WHEN status IN ('error','timeout','budget-blocked') THEN 1 ELSE 0 END) AS errors
       FROM ai_inference_log
       WHERE created_at >= ?`
    )
    .get(windowStartIso) as OverallRow | undefined;
  return (
    row ?? {
      total_calls: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
      cache_hits: 0,
      errors: 0,
    }
  );
}

function fetchByProvider(db: BetterSqlite3.Database, windowStartIso: string): ProviderBreakdown[] {
  const rows = db
    .prepare(
      `SELECT
          provider,
          COUNT(*) AS calls,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(cost_usd), 0) AS cost_usd
       FROM ai_inference_log
       WHERE created_at >= ?
       GROUP BY provider
       ORDER BY calls DESC, provider ASC`
    )
    .all(windowStartIso) as ProviderRow[];

  return rows.map((r) => ({
    provider: r.provider,
    calls: r.calls,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costUsd: r.cost_usd,
  }));
}

function fetchByModel(db: BetterSqlite3.Database, windowStartIso: string): ModelBreakdown[] {
  // `avg_latency_ms` only considers `success` non-cached rows with
  // `latency_ms > 0` — matching the same filter used elsewhere in the
  // observability module so the numbers reconcile with the live dashboard.
  const rows = db
    .prepare(
      `SELECT
          provider,
          model,
          COUNT(*) AS calls,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          AVG(CASE
                WHEN status = 'success' AND cached = 0 AND latency_ms > 0
                THEN latency_ms
              END) AS avg_latency_ms
       FROM ai_inference_log
       WHERE created_at >= ?
       GROUP BY provider, model
       ORDER BY calls DESC, model ASC`
    )
    .all(windowStartIso) as ModelRow[];

  return rows.map((r) => ({
    provider: r.provider,
    model: r.model,
    calls: r.calls,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costUsd: r.cost_usd,
    avgLatencyMs: r.avg_latency_ms == null ? 0 : Math.round(r.avg_latency_ms),
  }));
}

/** Compute the ISO timestamp `windowDays` ago from `now`. */
export function computeWindowStart(windowDays: number, now: Date = new Date()): string {
  return new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
}

export interface ComputeSummaryOptions {
  /** Override the rolling window (defaults to 30 days). */
  windowDays?: number;
  /** Override "now" — used by tests to pin the window. */
  now?: Date;
  /** Database handle. Defaults to `getDb()`. */
  db?: BetterSqlite3.Database;
}

/**
 * Aggregate the last `windowDays` of `ai_inference_log` into a single
 * summary object. Deterministic given `(db, now, windowDays)`.
 */
export function computeSummary(opts: ComputeSummaryOptions = {}): ObservabilitySummary {
  const db = opts.db ?? getDb();
  const windowDays = opts.windowDays ?? SUMMARY_WINDOW_DAYS;
  const now = opts.now ?? new Date();
  const windowStart = computeWindowStart(windowDays, now);
  const windowEnd = now.toISOString();

  const overall = fetchOverall(db, windowStart);
  const byProvider = fetchByProvider(db, windowStart);
  const byModel = fetchByModel(db, windowStart);

  const totalCalls = overall.total_calls;
  const cacheHitRate = totalCalls > 0 ? overall.cache_hits / totalCalls : 0;
  const errorRate = totalCalls > 0 ? overall.errors / totalCalls : 0;

  return {
    windowStart,
    windowEnd,
    totalCalls,
    totalInputTokens: overall.total_input_tokens,
    totalOutputTokens: overall.total_output_tokens,
    totalCostUsd: overall.total_cost_usd,
    cacheHitRate,
    errorRate,
    byProvider,
    byModel,
  };
}

export interface RunSummaryOptions extends ComputeSummaryOptions {}

export interface RunSummaryResult {
  summary: ObservabilitySummaryEnvelope;
}

/**
 * Compute and persist the 30-day rolling summary to the settings table.
 *
 * Idempotent — re-running overwrites the cached value. Safe to call from
 * the BullMQ worker without further locking.
 */
export function runSummary(opts: RunSummaryOptions = {}): RunSummaryResult {
  const summary = computeSummary(opts);
  const computedAt = (opts.now ?? new Date()).toISOString();
  const envelope: ObservabilitySummaryEnvelope = { ...summary, computedAt };

  setRawSetting(OBSERVABILITY_SUMMARY_SETTING_KEY, JSON.stringify(envelope));

  logger.info(
    {
      totalCalls: envelope.totalCalls,
      providers: envelope.byProvider.length,
      models: envelope.byModel.length,
      windowStart: envelope.windowStart,
      windowEnd: envelope.windowEnd,
      computedAt,
    },
    '[ai-observability-summary] Daily summary computed'
  );

  return { summary: envelope };
}
