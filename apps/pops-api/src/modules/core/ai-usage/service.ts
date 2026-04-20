import { and, desc, gte, lte, sql } from 'drizzle-orm';

/**
 * AI usage analytics service — Drizzle ORM
 */
import { aiInferenceLog as aiUsage } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

import type { AiUsageHistoryOutput, AiUsageHistoryRecord, AiUsageStatsOutput } from './types.js';

interface OverallUsage {
  totalCost: number;
  totalApiCalls: number;
  totalCacheHits: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

interface RecentUsage {
  cost: number;
  apiCalls: number;
  cacheHits: number;
  inputTokens: number;
  outputTokens: number;
}

const EMPTY_OVERALL: OverallUsage = {
  totalCost: 0,
  totalApiCalls: 0,
  totalCacheHits: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
};

const EMPTY_RECENT: RecentUsage = {
  cost: 0,
  apiCalls: 0,
  cacheHits: 0,
  inputTokens: 0,
  outputTokens: 0,
};

function coalesceNulls<T extends Record<string, number>>(defaults: T, row: T | undefined): T {
  if (!row) return defaults;
  const out = { ...defaults };
  for (const key of Object.keys(out) as (keyof T)[]) {
    const value = row[key];
    if (value != null) out[key] = value;
  }
  return out;
}

function fetchOverallUsage(): OverallUsage {
  const [row] = getDrizzle()
    .select({
      totalCost: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.costUsd} ELSE 0 END)`,
      totalApiCalls: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN 1 ELSE 0 END)`,
      totalCacheHits: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 1 THEN 1 ELSE 0 END)`,
      totalInputTokens: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.inputTokens} ELSE 0 END)`,
      totalOutputTokens: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.outputTokens} ELSE 0 END)`,
    })
    .from(aiUsage)
    .all();
  return coalesceNulls(EMPTY_OVERALL, row);
}

function fetchRecentUsage(sinceIso: string): RecentUsage {
  const [row] = getDrizzle()
    .select({
      cost: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.costUsd} ELSE 0 END)`,
      apiCalls: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN 1 ELSE 0 END)`,
      cacheHits: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 1 THEN 1 ELSE 0 END)`,
      inputTokens: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.inputTokens} ELSE 0 END)`,
      outputTokens: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.outputTokens} ELSE 0 END)`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, sinceIso))
    .all();
  return coalesceNulls(EMPTY_RECENT, row);
}

/**
 * Get overall AI usage statistics
 */
export function getStats(): AiUsageStatsOutput {
  const overall = fetchOverallUsage();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const last30Days = fetchRecentUsage(thirtyDaysAgo.toISOString());

  const totalEvents = overall.totalApiCalls + overall.totalCacheHits;
  const has30dActivity = last30Days.apiCalls > 0 || last30Days.cacheHits > 0;

  return {
    totalCost: overall.totalCost,
    totalApiCalls: overall.totalApiCalls,
    totalCacheHits: overall.totalCacheHits,
    cacheHitRate: totalEvents > 0 ? overall.totalCacheHits / totalEvents : 0,
    avgCostPerCall: overall.totalApiCalls > 0 ? overall.totalCost / overall.totalApiCalls : 0,
    totalInputTokens: overall.totalInputTokens,
    totalOutputTokens: overall.totalOutputTokens,
    last30Days: has30dActivity ? last30Days : undefined,
  };
}

/**
 * Get AI usage history grouped by date
 */
export function getHistory(startDate?: string, endDate?: string): AiUsageHistoryOutput {
  const db = getDrizzle();

  // Build date filter conditions
  const conditions = [];
  if (startDate) {
    conditions.push(gte(sql`DATE(${aiUsage.createdAt})`, startDate));
  }
  if (endDate) {
    conditions.push(lte(sql`DATE(${aiUsage.createdAt})`, endDate));
  }

  const where = (() => {
    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  })();

  // Get daily aggregated stats
  const records = db
    .select({
      date: sql<string>`DATE(${aiUsage.createdAt})`,
      apiCalls: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN 1 ELSE 0 END)`,
      cacheHits: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 1 THEN 1 ELSE 0 END)`,
      inputTokens: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.inputTokens} ELSE 0 END)`,
      outputTokens: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.outputTokens} ELSE 0 END)`,
      cost: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.costUsd} ELSE 0 END)`,
    })
    .from(aiUsage)
    .where(where)
    .groupBy(sql`DATE(${aiUsage.createdAt})`)
    .orderBy(desc(sql`DATE(${aiUsage.createdAt})`))
    .all();

  // Calculate summary
  const summary = {
    totalCost: records.reduce((sum, r) => sum + r.cost, 0),
    totalApiCalls: records.reduce((sum, r) => sum + r.apiCalls, 0),
    totalCacheHits: records.reduce((sum, r) => sum + r.cacheHits, 0),
  };

  // Map to output format
  const mappedRecords: AiUsageHistoryRecord[] = records.map((r) => ({
    date: r.date,
    apiCalls: r.apiCalls,
    cacheHits: r.cacheHits,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cost: r.cost,
  }));

  return {
    records: mappedRecords,
    summary,
  };
}
