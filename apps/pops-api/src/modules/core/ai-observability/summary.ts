import { and, asc, desc, gte, lt, sql, type SQL } from 'drizzle-orm';

import { aiInferenceLog } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { logger } from '../../../lib/logger.js';
import { setRawSetting } from '../settings/service.js';

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
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  cacheHits: number;
  errors: number;
}

const EMPTY_OVERALL: OverallRow = {
  totalCalls: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUsd: 0,
  cacheHits: 0,
  errors: 0,
};

function windowWhere(windowStartIso: string, windowEndIso: string): SQL | undefined {
  return and(
    gte(aiInferenceLog.createdAt, windowStartIso),
    lt(aiInferenceLog.createdAt, windowEndIso)
  );
}

function fetchOverall(windowStartIso: string, windowEndIso: string): OverallRow {
  const [row] = getDrizzle()
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      totalInputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.outputTokens}), 0)`,
      totalCostUsd: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
      cacheHits: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 1 THEN 1 ELSE 0 END), 0)`,
      errors: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.status} IN ('error','timeout','budget-blocked') THEN 1 ELSE 0 END), 0)`,
    })
    .from(aiInferenceLog)
    .where(windowWhere(windowStartIso, windowEndIso))
    .all();

  if (!row) return { ...EMPTY_OVERALL };
  return {
    totalCalls: row.totalCalls ?? 0,
    totalInputTokens: row.totalInputTokens ?? 0,
    totalOutputTokens: row.totalOutputTokens ?? 0,
    totalCostUsd: row.totalCostUsd ?? 0,
    cacheHits: row.cacheHits ?? 0,
    errors: row.errors ?? 0,
  };
}

function fetchByProvider(windowStartIso: string, windowEndIso: string): ProviderBreakdown[] {
  const rows = getDrizzle()
    .select({
      provider: aiInferenceLog.provider,
      calls: sql<number>`COUNT(*)`,
      inputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.outputTokens}), 0)`,
      costUsd: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
    })
    .from(aiInferenceLog)
    .where(windowWhere(windowStartIso, windowEndIso))
    .groupBy(aiInferenceLog.provider)
    .orderBy(desc(sql<number>`COUNT(*)`), asc(aiInferenceLog.provider))
    .all();

  return rows.map((r) => ({
    provider: r.provider,
    calls: r.calls,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.costUsd,
  }));
}

function fetchByModel(windowStartIso: string, windowEndIso: string): ModelBreakdown[] {
  // avgLatencyMs filter mirrors the live dashboard so cached and live numbers reconcile.
  const rows = getDrizzle()
    .select({
      provider: aiInferenceLog.provider,
      model: aiInferenceLog.model,
      calls: sql<number>`COUNT(*)`,
      inputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.outputTokens}), 0)`,
      costUsd: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
      avgLatencyMs: sql<number | null>`AVG(CASE
            WHEN ${aiInferenceLog.status} = 'success'
              AND ${aiInferenceLog.cached} = 0
              AND ${aiInferenceLog.latencyMs} > 0
            THEN ${aiInferenceLog.latencyMs}
          END)`,
    })
    .from(aiInferenceLog)
    .where(windowWhere(windowStartIso, windowEndIso))
    .groupBy(aiInferenceLog.provider, aiInferenceLog.model)
    .orderBy(desc(sql<number>`COUNT(*)`), asc(aiInferenceLog.model), asc(aiInferenceLog.provider))
    .all();

  return rows.map((r) => ({
    provider: r.provider,
    model: r.model,
    calls: r.calls,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.costUsd,
    avgLatencyMs: r.avgLatencyMs == null ? 0 : Math.round(r.avgLatencyMs),
  }));
}

export function computeWindowStart(windowDays: number, now: Date = new Date()): string {
  return new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
}

export interface ComputeSummaryOptions {
  /** Override the rolling window (defaults to 30 days). */
  windowDays?: number;
  /** Override "now" — used by tests to pin the window. */
  now?: Date;
}

export function computeSummary(opts: ComputeSummaryOptions = {}): ObservabilitySummary {
  const windowDays = opts.windowDays ?? SUMMARY_WINDOW_DAYS;
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new RangeError(`windowDays must be a positive integer, got ${windowDays}`);
  }
  const now = opts.now ?? new Date();
  const windowStart = computeWindowStart(windowDays, now);
  const windowEnd = now.toISOString();

  const overall = fetchOverall(windowStart, windowEnd);
  const byProvider = fetchByProvider(windowStart, windowEnd);
  const byModel = fetchByModel(windowStart, windowEnd);

  const totalCalls = overall.totalCalls;
  const cacheHitRate = totalCalls > 0 ? overall.cacheHits / totalCalls : 0;
  const errorRate = totalCalls > 0 ? overall.errors / totalCalls : 0;

  return {
    windowStart,
    windowEnd,
    totalCalls,
    totalInputTokens: overall.totalInputTokens,
    totalOutputTokens: overall.totalOutputTokens,
    totalCostUsd: overall.totalCostUsd,
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

export function runSummary(opts: RunSummaryOptions = {}): RunSummaryResult {
  const summary = computeSummary(opts);
  const computedAt = summary.windowEnd;
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
