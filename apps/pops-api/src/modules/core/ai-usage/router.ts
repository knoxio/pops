/**
 * tRPC router for AI usage analytics.
 *
 * Procedures:
 * - getStats: Get overall AI usage statistics
 * - getHistory: Get AI usage history over time
 * - cacheStats: Get AI cache statistics (entry count, disk size)
 * - clearStaleCache: Remove cache entries older than N days
 * - clearAllCache: Clear entire AI cache
 */
import { z } from 'zod';

import { protectedProcedure, router } from '../../../trpc.js';
import {
  clearAllCache,
  clearStaleCache,
  getCacheStats,
} from '../../finance/imports/lib/ai-categorizer.js';
import { getHistory, getStats } from './service.js';
import { getHistoryInputSchema } from './types.js';

export const aiUsageRouter = router({
  /**
   * Get overall AI usage statistics
   * Returns total costs, API calls, cache hit rate, etc.
   */
  getStats: protectedProcedure.query(() => {
    return getStats();
  }),

  /**
   * Get AI usage history filtered by date range
   */
  getHistory: protectedProcedure.input(getHistoryInputSchema).query(({ input }) => {
    return getHistory(input.startDate, input.endDate);
  }),

  /** Get AI cache statistics */
  cacheStats: protectedProcedure.query(() => {
    return getCacheStats();
  }),

  /** Remove cache entries older than maxAgeDays */
  clearStaleCache: protectedProcedure
    .input(z.object({ maxAgeDays: z.number().int().positive().default(30) }))
    .mutation(({ input }) => {
      const removed = clearStaleCache(input.maxAgeDays);
      return { removed };
    }),

  /** Clear entire AI cache */
  clearAllCache: protectedProcedure.mutation(() => {
    const removed = clearAllCache();
    return { removed };
  }),
});
