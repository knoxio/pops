import { protectedProcedure, router } from '../../../trpc.js';
import { getHistory, getLatencyStats, getQualityMetrics, getStats } from './service.js';
import { observabilityFiltersSchema } from './types.js';

export const aiObservabilityRouter = router({
  getStats: protectedProcedure
    .input(observabilityFiltersSchema.optional())
    .query(({ input }) => getStats(input ?? {})),

  getHistory: protectedProcedure
    .input(observabilityFiltersSchema.optional())
    .query(({ input }) => getHistory(input ?? {})),

  getLatencyStats: protectedProcedure
    .input(observabilityFiltersSchema.optional())
    .query(({ input }) => getLatencyStats(input ?? {})),

  getQualityMetrics: protectedProcedure
    .input(observabilityFiltersSchema.optional())
    .query(({ input }) => getQualityMetrics(input ?? {})),
});
