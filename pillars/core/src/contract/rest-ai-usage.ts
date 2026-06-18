/**
 * `ai-usage.*` sub-router — AI usage analytics + cache maintenance
 * (`core.aiUsage.*`).
 *
 * Mapping from the legacy tRPC router:
 *   - `getStats`        (query, no input)      → `GET  /ai-usage/stats`
 *   - `getHistory`      (query, date range)    → `GET  /ai-usage/history` (query params)
 *   - `cacheStats`      (query, no input)      → `GET  /ai-usage/cache`
 *   - `clearStaleCache` (mutation, maxAgeDays) → `POST /ai-usage/cache/prune` (body)
 *   - `clearAllCache`   (mutation, no input)   → `DELETE /ai-usage/cache`
 *
 * Response shapes mirror `ai-usage/service.ts` + `ai-usage/cache.ts` exactly.
 * `clearStaleCache` carries a body, so it must be POST (a GET can't carry one);
 * `clearAllCache` is a bodyless purge of the whole cache, so it's a DELETE.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES } from './rest-schemas.js';

const c = initContract();

/** Mirrors `aiUsageStatsOutputSchema` in `api/modules/ai-usage/types.ts`. */
const AiUsageStatsSchema = z.object({
  totalCost: z.number(),
  totalApiCalls: z.number(),
  totalCacheHits: z.number(),
  cacheHitRate: z.number(),
  avgCostPerCall: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  last30Days: z
    .object({
      cost: z.number(),
      apiCalls: z.number(),
      cacheHits: z.number(),
      inputTokens: z.number(),
      outputTokens: z.number(),
    })
    .optional(),
});

/** Mirrors `aiUsageHistoryOutputSchema` in `api/modules/ai-usage/types.ts`. */
const AiUsageHistorySchema = z.object({
  records: z.array(
    z.object({
      date: z.string(),
      apiCalls: z.number(),
      cacheHits: z.number(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      cost: z.number(),
    })
  ),
  summary: z.object({
    totalCost: z.number(),
    totalApiCalls: z.number(),
    totalCacheHits: z.number(),
  }),
});

const CacheStatsSchema = z.object({
  totalEntries: z.number(),
  diskSizeBytes: z.number(),
});

const RemovedSchema = z.object({ removed: z.number() });

const HistoryQuery = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const ClearStaleBody = z.object({
  maxAgeDays: z.number().int().positive().optional().default(30),
});

export const coreAiUsageContract = c.router({
  getStats: {
    method: 'GET',
    path: '/ai-usage/stats',
    responses: { 200: AiUsageStatsSchema },
    summary: 'Get overall AI usage statistics (cost, calls, cache hit rate, 30-day roll-up)',
  },
  getHistory: {
    method: 'GET',
    path: '/ai-usage/history',
    query: HistoryQuery,
    responses: { 200: AiUsageHistorySchema },
    summary: 'Get AI usage history grouped by UTC date over an optional inclusive range',
  },
  cacheStats: {
    method: 'GET',
    path: '/ai-usage/cache',
    responses: { 200: CacheStatsSchema },
    summary: 'Get AI cache statistics (entry count, on-disk size)',
  },
  clearStaleCache: {
    method: 'POST',
    path: '/ai-usage/cache/prune',
    body: ClearStaleBody,
    responses: { 200: RemovedSchema, ...ERR_RESPONSES },
    summary: 'Remove AI cache entries older than maxAgeDays',
  },
  clearAllCache: {
    method: 'DELETE',
    path: '/ai-usage/cache',
    body: z.object({}).optional(),
    responses: { 200: RemovedSchema },
    summary: 'Clear the entire AI cache',
  },
});
