/**
 * Dashboard-shaped reads against `ai_inference_log`.
 *
 * Sibling to {@link ./ai-usage.ts}'s `sumInferenceLogUsage` which sums
 * everything indiscriminately. The dashboard endpoints (AI Ops
 * `getStats` / `getHistory`) need a cached-aware split: cached rows
 * count toward cache-hit tallies but never contribute to cost or token
 * spend. These helpers encapsulate the CASE-based aggregation so the
 * pops-api layer keeps a thin pass-through service.
 */
import { and, desc, gte, lte, sql, type SQL } from 'drizzle-orm';

import { aiInferenceLog } from '../schema.js';
import { buildInferenceLogConditions, type ListInferenceLogsFilter } from './ai-usage-filters.js';

import type { CoreDb } from './internal.js';

/** Dashboard-shaped aggregate of `ai_inference_log`. Splits cached vs
 * non-cached rows: cost and token sums exclude cached rows so a cache
 * hit never contributes to spend; api-call and cache-hit counters track
 * the two populations separately. Used by the AI Ops `getStats`
 * endpoint which surfaces cache hit rate and avg cost per call. */
export interface DashboardInferenceLogStats {
  totalCost: number;
  totalApiCalls: number;
  totalCacheHits: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

const EMPTY_DASHBOARD_STATS: DashboardInferenceLogStats = {
  totalCost: 0,
  totalApiCalls: 0,
  totalCacheHits: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
};

function coalesceDashboardStats(
  row: DashboardInferenceLogStats | undefined
): DashboardInferenceLogStats {
  if (!row) return EMPTY_DASHBOARD_STATS;
  return {
    totalCost: row.totalCost ?? 0,
    totalApiCalls: row.totalApiCalls ?? 0,
    totalCacheHits: row.totalCacheHits ?? 0,
    totalInputTokens: row.totalInputTokens ?? 0,
    totalOutputTokens: row.totalOutputTokens ?? 0,
  };
}

/**
 * Dashboard-shaped variant of `sumInferenceLogUsage`. Returns the
 * 5-field cached-aware stats shape consumed by `core.aiUsage.getStats`.
 * Cached rows contribute to `totalCacheHits` only; everything else is
 * summed across non-cached rows.
 */
export function summarizeInferenceLogStats(
  db: CoreDb,
  filter: ListInferenceLogsFilter
): DashboardInferenceLogStats {
  const condition = buildInferenceLogConditions(filter);
  const [row] = db
    .select({
      totalCost: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 0 THEN ${aiInferenceLog.costUsd} ELSE 0 END), 0)`,
      totalApiCalls: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 0 THEN 1 ELSE 0 END), 0)`,
      totalCacheHits: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 1 THEN 1 ELSE 0 END), 0)`,
      totalInputTokens: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 0 THEN ${aiInferenceLog.inputTokens} ELSE 0 END), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 0 THEN ${aiInferenceLog.outputTokens} ELSE 0 END), 0)`,
    })
    .from(aiInferenceLog)
    .where(condition)
    .all();
  return coalesceDashboardStats(row);
}

/** One day's worth of dashboard stats. `date` is the `YYYY-MM-DD`
 * bucket derived from `created_at` (UTC). */
export interface DashboardInferenceLogDailyRow extends DashboardInferenceLogStats {
  date: string;
}

/** Optional inclusive date-window filter for
 * {@link groupInferenceLogByDate}. Dates are matched against
 * `DATE(created_at)` so callers pass `YYYY-MM-DD` boundaries. */
export interface GroupInferenceLogByDateFilter {
  startDate?: string;
  endDate?: string;
}

function buildDateWindowCondition(filter: GroupInferenceLogByDateFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.startDate)
    conditions.push(gte(sql`DATE(${aiInferenceLog.createdAt})`, filter.startDate));
  if (filter.endDate) conditions.push(lte(sql`DATE(${aiInferenceLog.createdAt})`, filter.endDate));
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

/**
 * Dashboard-shaped daily roll-up of `ai_inference_log`. Returns one row
 * per UTC date in `[startDate, endDate]` (both inclusive, both
 * optional) newest-first. Mirrors {@link summarizeInferenceLogStats}'s
 * cached split per bucket. Used by `core.aiUsage.getHistory` to drive
 * the timeline chart.
 */
export function groupInferenceLogByDate(
  db: CoreDb,
  filter: GroupInferenceLogByDateFilter
): DashboardInferenceLogDailyRow[] {
  return db
    .select({
      date: sql<string>`DATE(${aiInferenceLog.createdAt})`,
      totalCost: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 0 THEN ${aiInferenceLog.costUsd} ELSE 0 END), 0)`,
      totalApiCalls: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 0 THEN 1 ELSE 0 END), 0)`,
      totalCacheHits: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 1 THEN 1 ELSE 0 END), 0)`,
      totalInputTokens: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 0 THEN ${aiInferenceLog.inputTokens} ELSE 0 END), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(CASE WHEN ${aiInferenceLog.cached} = 0 THEN ${aiInferenceLog.outputTokens} ELSE 0 END), 0)`,
    })
    .from(aiInferenceLog)
    .where(buildDateWindowCondition(filter))
    .groupBy(sql`DATE(${aiInferenceLog.createdAt})`)
    .orderBy(desc(sql`DATE(${aiInferenceLog.createdAt})`))
    .all();
}
