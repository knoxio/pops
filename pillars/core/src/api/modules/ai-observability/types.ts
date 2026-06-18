import { z } from 'zod';

export const observabilityFiltersSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  domain: z.string().optional(),
  operation: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ObservabilityFilters = z.infer<typeof observabilityFiltersSchema>;

export const breakdownItemSchema = z.object({
  key: z.string(),
  calls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
});

export const statsOutputSchema = z.object({
  totalCalls: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCostUsd: z.number(),
  cacheHitRate: z.number(),
  errorRate: z.number(),
  byProvider: z.array(breakdownItemSchema),
  byModel: z.array(breakdownItemSchema),
  byDomain: z.array(breakdownItemSchema),
  byOperation: z.array(breakdownItemSchema),
});

export type StatsOutput = z.infer<typeof statsOutputSchema>;

export const historyRecordSchema = z.object({
  date: z.string(),
  calls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  cacheHits: z.number(),
  errors: z.number(),
});

export const historyOutputSchema = z.object({
  records: z.array(historyRecordSchema),
  summary: z.object({
    totalCostUsd: z.number(),
    totalCalls: z.number(),
    totalCacheHits: z.number(),
  }),
});

export type HistoryOutput = z.infer<typeof historyOutputSchema>;

export const latencyStatsSchema = z.object({
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

export type LatencyStats = z.infer<typeof latencyStatsSchema>;

export const qualityMetricsSchema = z.object({
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

export type QualityMetrics = z.infer<typeof qualityMetricsSchema>;
