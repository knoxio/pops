/**
 * tRPC router for AI observability dashboards (`core.aiObservability.*`).
 */
import { protectedProcedure, router } from '../../trpc.js';
import { getHistory, getLatencyStats, getQualityMetrics, getStats } from './service.js';
import { observabilityFiltersSchema } from './types.js';

export const aiObservabilityRouter = router({
  getStats: protectedProcedure
    .input(observabilityFiltersSchema.optional())
    .query(({ input, ctx }) => getStats(ctx.coreDb, input ?? {})),

  getHistory: protectedProcedure
    .input(observabilityFiltersSchema.optional())
    .query(({ input, ctx }) => getHistory(ctx.coreDb, input ?? {})),

  getLatencyStats: protectedProcedure
    .input(observabilityFiltersSchema.optional())
    .query(({ input, ctx }) => getLatencyStats(ctx.coreDb, input ?? {})),

  getQualityMetrics: protectedProcedure
    .input(observabilityFiltersSchema.optional())
    .query(({ input, ctx }) => getQualityMetrics(ctx.coreDb, input ?? {})),
});
