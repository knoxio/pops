/**
 * Handlers for the `ai-usage.*` sub-router.
 *
 * Thin wrappers over the existing `ai-usage/service.ts` (stats + history,
 * reading `core.db`) and the process-global `ai-usage/cache.ts` (entry count,
 * prune, clear). The cache helpers operate on an on-disk JSON file, not the
 * db handle, so they take no `db` argument. Wire shapes are preserved.
 */
import { type CoreDb } from '../../db/index.js';
import { clearAllCache, clearStaleCache, getCacheStats } from '../modules/ai-usage/cache.js';
import { getHistory, getStats } from '../modules/ai-usage/service.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { coreAiUsageContract } from '../../contract/rest-ai-usage.js';

type Req = ServerInferRequest<typeof coreAiUsageContract>;

export function makeAiUsageHandlers(db: CoreDb) {
  return {
    getStats: () => runHttp(() => ({ status: 200 as const, body: getStats(db) })),

    getHistory: ({ query }: Req['getHistory']) =>
      runHttp(() => ({
        status: 200 as const,
        body: getHistory(db, query.startDate, query.endDate),
      })),

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
