/**
 * Handlers for the `ai-usage.*` sub-router.
 *
 * Thin wrappers over the process-global `ai-usage/cache.ts` (entry count,
 * prune, clear) — the finance-categorizer cache that stays in core. The
 * cache helpers operate on an on-disk JSON file, not the db handle, so they
 * take no `db` argument. Wire shapes are preserved.
 */
import { clearAllCache, clearStaleCache, getCacheStats } from '../modules/ai-usage/cache.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { coreAiUsageContract } from '../../contract/rest-ai-usage.js';

type Req = ServerInferRequest<typeof coreAiUsageContract>;

export function makeAiUsageHandlers() {
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
