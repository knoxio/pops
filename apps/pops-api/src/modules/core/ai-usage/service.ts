/**
 * AI usage analytics service
 */
import { getDb } from "../../../db.js";
import type { AiUsageStatsOutput, AiUsageHistoryOutput, AiUsageHistoryRecord } from "./types.js";

/**
 * Get overall AI usage statistics
 */
export function getStats(): AiUsageStatsOutput {
  const db = getDb();

  // Overall stats (all time)
  const overall = db
    .prepare(
      `
    SELECT
      SUM(CASE WHEN cached = 0 THEN cost_usd ELSE 0 END) as total_cost,
      SUM(CASE WHEN cached = 0 THEN 1 ELSE 0 END) as total_api_calls,
      SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END) as total_cache_hits,
      SUM(CASE WHEN cached = 0 THEN input_tokens ELSE 0 END) as total_input_tokens,
      SUM(CASE WHEN cached = 0 THEN output_tokens ELSE 0 END) as total_output_tokens
    FROM ai_usage
  `
    )
    .get() as {
    total_cost: number | null;
    total_api_calls: number | null;
    total_cache_hits: number | null;
    total_input_tokens: number | null;
    total_output_tokens: number | null;
  };

  // Last 30 days stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

  const last30Days = db
    .prepare(
      `
    SELECT
      SUM(CASE WHEN cached = 0 THEN cost_usd ELSE 0 END) as cost,
      SUM(CASE WHEN cached = 0 THEN 1 ELSE 0 END) as api_calls,
      SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END) as cache_hits
    FROM ai_usage
    WHERE created_at >= ?
  `
    )
    .get(thirtyDaysAgoIso) as {
    cost: number | null;
    api_calls: number | null;
    cache_hits: number | null;
  };

  const totalApiCalls = overall.total_api_calls ?? 0;
  const totalCacheHits = overall.total_cache_hits ?? 0;
  const totalCost = overall.total_cost ?? 0;

  return {
    totalCost,
    totalApiCalls,
    totalCacheHits,
    cacheHitRate:
      totalApiCalls + totalCacheHits > 0 ? totalCacheHits / (totalApiCalls + totalCacheHits) : 0,
    avgCostPerCall: totalApiCalls > 0 ? totalCost / totalApiCalls : 0,
    totalInputTokens: overall.total_input_tokens ?? 0,
    totalOutputTokens: overall.total_output_tokens ?? 0,
    last30Days:
      last30Days.api_calls || last30Days.cache_hits
        ? {
            cost: last30Days.cost ?? 0,
            apiCalls: last30Days.api_calls ?? 0,
            cacheHits: last30Days.cache_hits ?? 0,
          }
        : undefined,
  };
}

/**
 * Get AI usage history grouped by date
 */
export function getHistory(startDate?: string, endDate?: string): AiUsageHistoryOutput {
  const db = getDb();

  // Build date filter
  const whereClause: string[] = [];
  const params: string[] = [];

  if (startDate) {
    whereClause.push("DATE(created_at) >= ?");
    params.push(startDate);
  }

  if (endDate) {
    whereClause.push("DATE(created_at) <= ?");
    params.push(endDate);
  }

  const where = whereClause.length > 0 ? `WHERE ${whereClause.join(" AND ")}` : "";

  // Get daily aggregated stats
  const records = db
    .prepare(
      `
    SELECT
      DATE(created_at) as date,
      SUM(CASE WHEN cached = 0 THEN 1 ELSE 0 END) as api_calls,
      SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END) as cache_hits,
      SUM(CASE WHEN cached = 0 THEN input_tokens ELSE 0 END) as input_tokens,
      SUM(CASE WHEN cached = 0 THEN output_tokens ELSE 0 END) as output_tokens,
      SUM(CASE WHEN cached = 0 THEN cost_usd ELSE 0 END) as cost
    FROM ai_usage
    ${where}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `
    )
    .all(...params) as Array<{
    date: string;
    api_calls: number;
    cache_hits: number;
    input_tokens: number;
    output_tokens: number;
    cost: number;
  }>;

  // Calculate summary
  const summary = {
    totalCost: records.reduce((sum, r) => sum + r.cost, 0),
    totalApiCalls: records.reduce((sum, r) => sum + r.api_calls, 0),
    totalCacheHits: records.reduce((sum, r) => sum + r.cache_hits, 0),
  };

  // Map to output format
  const mappedRecords: AiUsageHistoryRecord[] = records.map((r) => ({
    date: r.date,
    apiCalls: r.api_calls,
    cacheHits: r.cache_hits,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cost: r.cost,
  }));

  return {
    records: mappedRecords,
    summary,
  };
}
