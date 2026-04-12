/**
 * AI usage analytics service — Drizzle ORM
 */
import { aiUsage } from '@pops/db-types';
import { and, desc, gte, lte, sql } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import type { AiUsageHistoryOutput, AiUsageHistoryRecord, AiUsageStatsOutput } from './types.js';

/**
 * Get overall AI usage statistics
 */
export function getStats(): AiUsageStatsOutput {
  const db = getDrizzle();

  // Overall stats (all time)
  const [overall] = db
    .select({
      totalCost: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.costUsd} ELSE 0 END)`,
      totalApiCalls: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN 1 ELSE 0 END)`,
      totalCacheHits: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 1 THEN 1 ELSE 0 END)`,
      totalInputTokens: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.inputTokens} ELSE 0 END)`,
      totalOutputTokens: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.outputTokens} ELSE 0 END)`,
    })
    .from(aiUsage)
    .all();

  // Last 30 days stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

  const [last30Days] = db
    .select({
      cost: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.costUsd} ELSE 0 END)`,
      apiCalls: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN 1 ELSE 0 END)`,
      cacheHits: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 1 THEN 1 ELSE 0 END)`,
      inputTokens: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.inputTokens} ELSE 0 END)`,
      outputTokens: sql<number>`SUM(CASE WHEN ${aiUsage.cached} = 0 THEN ${aiUsage.outputTokens} ELSE 0 END)`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, thirtyDaysAgoIso))
    .all();

  const totalApiCalls = overall?.totalApiCalls ?? 0;
  const totalCacheHits = overall?.totalCacheHits ?? 0;
  const totalCost = overall?.totalCost ?? 0;

  return {
    totalCost,
    totalApiCalls,
    totalCacheHits,
    cacheHitRate:
      totalApiCalls + totalCacheHits > 0 ? totalCacheHits / (totalApiCalls + totalCacheHits) : 0,
    avgCostPerCall: totalApiCalls > 0 ? totalCost / totalApiCalls : 0,
    totalInputTokens: overall?.totalInputTokens ?? 0,
    totalOutputTokens: overall?.totalOutputTokens ?? 0,
    last30Days:
      last30Days?.apiCalls || last30Days?.cacheHits
        ? {
            cost: last30Days?.cost ?? 0,
            apiCalls: last30Days?.apiCalls ?? 0,
            cacheHits: last30Days?.cacheHits ?? 0,
            inputTokens: last30Days?.inputTokens ?? 0,
            outputTokens: last30Days?.outputTokens ?? 0,
          }
        : undefined,
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

  const where =
    conditions.length > 0
      ? conditions.length === 1
        ? conditions[0]
        : and(...conditions)
      : undefined;

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
