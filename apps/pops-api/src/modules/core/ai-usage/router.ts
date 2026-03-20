/**
 * tRPC router for AI usage analytics.
 *
 * Procedures:
 * - getStats: Get overall AI usage statistics
 * - getHistory: Get AI usage history over time
 */
import { router, protectedProcedure } from "../../../trpc.js";
import { getStats, getHistory } from "./service.js";
import { getHistoryInputSchema } from "./types.js";

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
});
