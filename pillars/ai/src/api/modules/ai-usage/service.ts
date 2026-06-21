/**
 * AI usage analytics service.
 *
 * Reads land on `core.db` via the relocated `aiUsageService` helpers
 * (`summarizeInferenceLogStats`, `groupInferenceLogByDate`). The pillar
 * threads the request-scoped drizzle handle (`ctx.coreDb`) through these
 * functions instead of the monolith's `getCoreDrizzle()` singleton.
 */
import { aiUsageService, type AiDb } from '../../../db/index.js';

import type { AiUsageHistoryOutput, AiUsageHistoryRecord, AiUsageStatsOutput } from './types.js';

/**
 * Get overall AI usage statistics across the entire `ai_inference_log`,
 * with a 30-day-window roll-up surfaced separately. Cache hits are
 * counted but do not contribute to cost or token sums.
 */
export function getStats(db: AiDb): AiUsageStatsOutput {
  const overall = aiUsageService.summarizeInferenceLogStats(db, {});

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const last30 = aiUsageService.summarizeInferenceLogStats(db, {
    since: thirtyDaysAgo.toISOString(),
  });

  const totalEvents = overall.totalApiCalls + overall.totalCacheHits;
  const has30dActivity = last30.totalApiCalls > 0 || last30.totalCacheHits > 0;

  return {
    totalCost: overall.totalCost,
    totalApiCalls: overall.totalApiCalls,
    totalCacheHits: overall.totalCacheHits,
    cacheHitRate: totalEvents > 0 ? overall.totalCacheHits / totalEvents : 0,
    avgCostPerCall: overall.totalApiCalls > 0 ? overall.totalCost / overall.totalApiCalls : 0,
    totalInputTokens: overall.totalInputTokens,
    totalOutputTokens: overall.totalOutputTokens,
    last30Days: has30dActivity
      ? {
          cost: last30.totalCost,
          apiCalls: last30.totalApiCalls,
          cacheHits: last30.totalCacheHits,
          inputTokens: last30.totalInputTokens,
          outputTokens: last30.totalOutputTokens,
        }
      : undefined,
  };
}

/**
 * Get AI usage history grouped by UTC date. `startDate` / `endDate` are
 * inclusive `YYYY-MM-DD` boundaries matched against `DATE(created_at)`.
 */
export function getHistory(db: AiDb, startDate?: string, endDate?: string): AiUsageHistoryOutput {
  const rows = aiUsageService.groupInferenceLogByDate(db, {
    startDate,
    endDate,
  });

  const records: AiUsageHistoryRecord[] = rows.map((r) => ({
    date: r.date,
    apiCalls: r.totalApiCalls,
    cacheHits: r.totalCacheHits,
    inputTokens: r.totalInputTokens,
    outputTokens: r.totalOutputTokens,
    cost: r.totalCost,
  }));

  const summary = {
    totalCost: records.reduce((sum, r) => sum + r.cost, 0),
    totalApiCalls: records.reduce((sum, r) => sum + r.apiCalls, 0),
    totalCacheHits: records.reduce((sum, r) => sum + r.cacheHits, 0),
  };

  return {
    records,
    summary,
  };
}
