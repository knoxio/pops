/**
 * `ai-usage.*` sub-router — finance-categorizer AI cache maintenance
 * (`core.aiUsage.*`).
 *
 * Only the cache surface lives in core. The AI-Ops telemetry analytics
 * (stats / history / providers / budgets / alerts / observability) were
 * extracted into the `ai` pillar (ai-ops plan §1.2); the finance-categorizer
 * cache (`ai_entity_cache.json`, served by `api/modules/ai-usage/cache.ts`)
 * stays in core until the finance re-home.
 *
 *   - `cacheStats`      (query, no input)      → `GET    /ai-usage/cache`
 *   - `clearStaleCache` (mutation, maxAgeDays) → `POST   /ai-usage/cache/prune` (body)
 *   - `clearAllCache`   (mutation, no input)   → `DELETE /ai-usage/cache`
 *
 * `clearStaleCache` carries a body, so it must be POST (a GET can't carry one);
 * `clearAllCache` is a bodyless purge of the whole cache, so it's a DELETE.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES } from './rest-schemas.js';

const c = initContract();

const CacheStatsSchema = z.object({
  totalEntries: z.number(),
  diskSizeBytes: z.number(),
});

const RemovedSchema = z.object({ removed: z.number() });

const ClearStaleBody = z.object({
  maxAgeDays: z.number().int().positive().optional().default(30),
});

export const coreAiUsageContract = c.router({
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
