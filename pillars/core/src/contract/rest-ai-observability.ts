/**
 * `ai-observability.*` sub-router — AI observability dashboards
 * (`core.aiObservability.*`).
 *
 * Mapping from the legacy tRPC router (all `query`, all carrying only the
 * optional `ObservabilityFilters` — provider/model/domain/operation +
 * start/end date — so each maps to a `GET` with those as query params):
 *   - `getStats`          → `GET /ai-observability/stats`
 *   - `getHistory`        → `GET /ai-observability/history`
 *   - `getLatencyStats`   → `GET /ai-observability/latency`
 *   - `getQualityMetrics` → `GET /ai-observability/quality`
 *
 * Output shapes mirror `ai-observability/types.ts` exactly.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/** Mirrors `observabilityFiltersSchema` in `ai-observability/types.ts`. */
const ObservabilityFilters = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  domain: z.string().optional(),
  operation: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const BreakdownItem = z.object({
  key: z.string(),
  calls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
});

/** Mirrors `statsOutputSchema`. */
const StatsOutput = z.object({
  totalCalls: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostUsd: z.number(),
  cacheHitRate: z.number(),
  errorRate: z.number(),
  byProvider: z.array(BreakdownItem),
  byModel: z.array(BreakdownItem),
  byDomain: z.array(BreakdownItem),
  byOperation: z.array(BreakdownItem),
});

/** Mirrors `historyOutputSchema`. */
const HistoryOutput = z.object({
  records: z.array(
    z.object({
      date: z.string(),
      calls: z.number(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      costUsd: z.number(),
      cacheHits: z.number(),
      errors: z.number(),
    })
  ),
  summary: z.object({
    totalCostUsd: z.number(),
    totalCalls: z.number(),
    totalCacheHits: z.number(),
  }),
});

/** Mirrors `latencyStatsSchema`. */
const LatencyStats = z.object({
  p50: z.number(),
  p75: z.number(),
  p95: z.number(),
  p99: z.number(),
  avg: z.number(),
  slowQueries: z.array(
    z.object({
      id: z.number(),
      model: z.string(),
      operation: z.string(),
      latencyMs: z.number(),
      createdAt: z.string(),
      contextId: z.string().nullable(),
    })
  ),
});

/** Mirrors `qualityMetricsSchema`. */
const QualityMetrics = z.object({
  byModel: z.array(
    z.object({
      model: z.string(),
      provider: z.string(),
      cacheHitRate: z.number(),
      errorRate: z.number(),
      timeoutRate: z.number(),
      budgetBlockRate: z.number(),
      averageLatencyMs: z.number(),
    })
  ),
});

export const coreAiObservabilityContract = c.router({
  getStats: {
    method: 'GET',
    path: '/ai-observability/stats',
    query: ObservabilityFilters,
    responses: { 200: StatsOutput },
    summary: 'Get AI observability stats (totals + per-provider/model/domain/operation breakdowns)',
  },
  getHistory: {
    method: 'GET',
    path: '/ai-observability/history',
    query: ObservabilityFilters,
    responses: { 200: HistoryOutput },
    summary: 'Get AI observability history grouped by date',
  },
  getLatencyStats: {
    method: 'GET',
    path: '/ai-observability/latency',
    query: ObservabilityFilters,
    responses: { 200: LatencyStats },
    summary: 'Get AI latency percentiles (p50/p75/p95/p99/avg) and the slowest queries',
  },
  getQualityMetrics: {
    method: 'GET',
    path: '/ai-observability/quality',
    query: ObservabilityFilters,
    responses: { 200: QualityMetrics },
    summary: 'Get per-model AI quality metrics (cache/error/timeout/budget-block rates)',
  },
});
