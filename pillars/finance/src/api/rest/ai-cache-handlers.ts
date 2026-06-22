/**
 * Handlers for the `aiCache.*` sub-router.
 *
 * Thin wrappers over the process-global `ai-usage-cache.ts` (entry count,
 * prune, clear) — the finance-categorizer cache re-homed from core (gap #3489).
 * The cache helpers operate on an on-disk JSON file, not the db handle, so they
 * take no `db` argument. Wire shapes are preserved.
 */
import { clearAllCache, clearStaleCache, getCacheStats } from '../modules/ai-usage-cache.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeAiCacheContract } from '../../contract/rest-ai-cache.js';

type Req = ServerInferRequest<typeof financeAiCacheContract>;

export function makeAiCacheHandlers() {
  return {
    cacheStats: () => runHttp(() => ({ status: 200 as const, body: getCacheStats() })),

    clearStaleCache: ({ body }: Req['clearStaleCache']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { removed: clearStaleCache(body.maxAgeDays) },
      })),

    clearAllCache: () =>
      runHttp(() => ({ status: 200 as const, body: { removed: clearAllCache() } })),
  };
}
