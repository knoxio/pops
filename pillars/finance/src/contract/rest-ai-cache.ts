/**
 * `aiCache.*` sub-router — finance-categorizer AI cache maintenance.
 *
 * The AI-Ops telemetry analytics (stats / history / providers / budgets /
 * alerts / observability) live in the `ai` pillar (ai-ops plan §1.2). The
 * finance-categorizer cache (`ai_entity_cache.json`, served by
 * `api/modules/ai-usage-cache.ts`) re-homed from core to finance (gap #3489):
 * it is finance-categorizer state, not AI-ops telemetry. Wire paths are
 * preserved verbatim so the cache-management UI is a transport swap.
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

export const financeAiCacheContract = c.router({
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
