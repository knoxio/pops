import { and, desc, gte, lte, sql } from 'drizzle-orm';

import { aiInferenceLog } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { buildGroupings } from './group-stats.js';

import type {
  HistoryOutput,
  LatencyStats,
  ObservabilityFilters,
  QualityMetrics,
  StatsOutput,
} from './types.js';

function buildWhere(filters: ObservabilityFilters): ReturnType<typeof and> | undefined {
  const conditions = [];

  if (filters.provider) {
    conditions.push(sql`${aiInferenceLog.provider} = ${filters.provider}`);
  }
  if (filters.model) {
    conditions.push(sql`${aiInferenceLog.model} = ${filters.model}`);
  }
  if (filters.domain) {
    if (filters.domain === 'general') {
      conditions.push(sql`${aiInferenceLog.domain} IS NULL`);
    } else {
      conditions.push(sql`${aiInferenceLog.domain} = ${filters.domain}`);
    }
  }
  if (filters.operation) {
    conditions.push(sql`${aiInferenceLog.operation} = ${filters.operation}`);
  }
  if (filters.startDate) {
    conditions.push(gte(sql`DATE(${aiInferenceLog.createdAt})`, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(sql`DATE(${aiInferenceLog.createdAt})`, filters.endDate));
  }

  return conditions.length === 0 ? undefined : and(...conditions);
}

interface OverallStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  cacheHits: number;
  errors: number;
}

const EMPTY_OVERALL: OverallStats = {
  totalCalls: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUsd: 0,
  cacheHits: 0,
  errors: 0,
};

function fetchOverallStats(where: ReturnType<typeof buildWhere>): OverallStats {
  const [row] = getDrizzle()
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      totalInputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.outputTokens}), 0)`,
      totalCostUsd: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
      cacheHits: sql<number>`SUM(CASE WHEN ${aiInferenceLog.cached} = 1 THEN 1 ELSE 0 END)`,
      errors: sql<number>`SUM(CASE WHEN ${aiInferenceLog.status} IN ('error','timeout','budget-blocked') THEN 1 ELSE 0 END)`,
    })
    .from(aiInferenceLog)
    .where(where)
    .all();
  if (!row) return EMPTY_OVERALL;
  const out = { ...EMPTY_OVERALL };
  for (const key of Object.keys(out) as (keyof OverallStats)[]) {
    const v = row[key];
    if (v != null) out[key] = v;
  }
  return out;
}

export function getStats(filters: ObservabilityFilters = {}): StatsOutput {
  const where = buildWhere(filters);
  const overall = fetchOverallStats(where);
  const groupings = buildGroupings(where, filters);

  return {
    totalCalls: overall.totalCalls,
    totalInputTokens: overall.totalInputTokens,
    totalOutputTokens: overall.totalOutputTokens,
    totalCostUsd: overall.totalCostUsd,
    cacheHitRate: overall.totalCalls > 0 ? overall.cacheHits / overall.totalCalls : 0,
    errorRate: overall.totalCalls > 0 ? overall.errors / overall.totalCalls : 0,
    ...groupings,
  };
}

export function getHistory(filters: ObservabilityFilters = {}): HistoryOutput {
  const db = getDrizzle();
  const where = buildWhere(filters);

  const records = db
    .select({
      date: sql<string>`DATE(${aiInferenceLog.createdAt})`,
      calls: sql<number>`COUNT(*)`,
      inputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.inputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${aiInferenceLog.outputTokens}), 0)`,
      costUsd: sql<number>`COALESCE(SUM(${aiInferenceLog.costUsd}), 0)`,
      cacheHits: sql<number>`SUM(CASE WHEN ${aiInferenceLog.cached} = 1 THEN 1 ELSE 0 END)`,
      errors: sql<number>`SUM(CASE WHEN ${aiInferenceLog.status} IN ('error','timeout','budget-blocked') THEN 1 ELSE 0 END)`,
    })
    .from(aiInferenceLog)
    .where(where)
    .groupBy(sql`DATE(${aiInferenceLog.createdAt})`)
    .orderBy(desc(sql`DATE(${aiInferenceLog.createdAt})`))
    .all();

  return {
    records,
    summary: {
      totalCostUsd: records.reduce((s, r) => s + r.costUsd, 0),
      totalCalls: records.reduce((s, r) => s + r.calls, 0),
      totalCacheHits: records.reduce((s, r) => s + r.cacheHits, 0),
    },
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(p * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
}

export function getLatencyStats(filters: ObservabilityFilters = {}): LatencyStats {
  const db = getDrizzle();
  const where = buildWhere(filters);

  const latencies = db
    .select({ latencyMs: aiInferenceLog.latencyMs })
    .from(aiInferenceLog)
    .where(
      and(
        where,
        sql`${aiInferenceLog.latencyMs} > 0`,
        sql`${aiInferenceLog.status} = 'success'`,
        sql`${aiInferenceLog.cached} = 0`
      )
    )
    .orderBy(aiInferenceLog.latencyMs)
    .all()
    .map((r) => r.latencyMs);

  const p95 = percentile(latencies, 0.95);
  const avg = latencies.length > 0 ? latencies.reduce((s, v) => s + v, 0) / latencies.length : 0;

  const slowQueries = db
    .select({
      id: aiInferenceLog.id,
      model: aiInferenceLog.model,
      operation: aiInferenceLog.operation,
      latencyMs: aiInferenceLog.latencyMs,
      createdAt: aiInferenceLog.createdAt,
      contextId: aiInferenceLog.contextId,
    })
    .from(aiInferenceLog)
    .where(
      and(
        where,
        sql`${aiInferenceLog.latencyMs} > 0`,
        sql`${aiInferenceLog.status} = 'success'`,
        sql`${aiInferenceLog.latencyMs} > ${p95 * 2}`,
        sql`${aiInferenceLog.cached} = 0`
      )
    )
    .orderBy(desc(aiInferenceLog.createdAt))
    .limit(20)
    .all();

  return {
    p50: percentile(latencies, 0.5),
    p75: percentile(latencies, 0.75),
    p95,
    p99: percentile(latencies, 0.99),
    avg,
    slowQueries,
  };
}

export function getQualityMetrics(filters: ObservabilityFilters = {}): QualityMetrics {
  const db = getDrizzle();
  const where = buildWhere(filters);

  const rows = db
    .select({
      model: aiInferenceLog.model,
      provider: aiInferenceLog.provider,
      total: sql<number>`COUNT(*)`,
      cacheHits: sql<number>`SUM(CASE WHEN ${aiInferenceLog.cached} = 1 THEN 1 ELSE 0 END)`,
      errors: sql<number>`SUM(CASE WHEN ${aiInferenceLog.status} = 'error' THEN 1 ELSE 0 END)`,
      timeouts: sql<number>`SUM(CASE WHEN ${aiInferenceLog.status} = 'timeout' THEN 1 ELSE 0 END)`,
      budgetBlocked: sql<number>`SUM(CASE WHEN ${aiInferenceLog.status} = 'budget-blocked' THEN 1 ELSE 0 END)`,
      avgLatency: sql<number>`COALESCE(AVG(CASE WHEN ${aiInferenceLog.latencyMs} > 0 AND ${aiInferenceLog.cached} = 0 THEN ${aiInferenceLog.latencyMs} END), 0)`,
    })
    .from(aiInferenceLog)
    .where(where)
    .groupBy(aiInferenceLog.model, aiInferenceLog.provider)
    .all();

  return {
    byModel: rows.map((r) => ({
      model: r.model,
      provider: r.provider,
      cacheHitRate: r.total > 0 ? r.cacheHits / r.total : 0,
      errorRate: r.total > 0 ? r.errors / r.total : 0,
      timeoutRate: r.total > 0 ? r.timeouts / r.total : 0,
      budgetBlockRate: r.total > 0 ? r.budgetBlocked / r.total : 0,
      averageLatencyMs: r.avgLatency,
    })),
  };
}
