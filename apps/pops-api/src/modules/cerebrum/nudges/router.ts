/**
 * tRPC router for cerebrum.nudges (PRD-084).
 *
 * Procedures:
 *   list      — list nudges with optional filters
 *   get       — get a single nudge by ID
 *   dismiss   — mark a nudge as dismissed
 *   act       — mark a nudge as acted (execute suggested action)
 *   scan      — trigger an on-demand nudge scan
 *   configure — update detection thresholds
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { HybridSearchService } from '../retrieval/hybrid-search.js';
import { ConsolidationDetector } from './detectors/consolidation.js';
import { PatternDetector } from './detectors/patterns.js';
import { StalenessDetector } from './detectors/staleness.js';
import { NudgeService } from './nudge-service.js';
import { DEFAULT_THRESHOLDS } from './types.js';

import type { NudgeThresholds } from './types.js';

/** Module-scoped thresholds — mutated by `configure`, shared across requests. */
let activeThresholds: NudgeThresholds = { ...DEFAULT_THRESHOLDS };

/** Build a NudgeService for the current request context. */
function getService(): NudgeService {
  const db = getDrizzle();
  const searchService = new HybridSearchService(db);
  return new NudgeService({
    db,
    searchService,
    consolidationDetector: new ConsolidationDetector(searchService, activeThresholds),
    stalenessDetector: new StalenessDetector(activeThresholds),
    patternDetector: new PatternDetector(activeThresholds),
    thresholds: activeThresholds,
  });
}

const nudgeTypeSchema = z.enum(['consolidation', 'staleness', 'pattern', 'insight']);
const nudgeStatusSchema = z.enum(['pending', 'dismissed', 'acted', 'expired']);
const nudgePrioritySchema = z.enum(['low', 'medium', 'high']);

export const nudgesRouter = router({
  /** List nudges with optional filters. */
  list: protectedProcedure
    .input(
      z
        .object({
          type: nudgeTypeSchema.optional(),
          status: nudgeStatusSchema.optional(),
          priority: nudgePrioritySchema.optional(),
          limit: z.number().int().positive().max(100).optional(),
          offset: z.number().int().nonnegative().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return getService().list(input ?? {});
    }),

  /** Get a specific nudge by ID. */
  get: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => {
    const nudge = getService().get(input.id);
    if (!nudge) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Nudge '${input.id}' not found` });
    }
    return { nudge };
  }),

  /** Dismiss a pending nudge. */
  dismiss: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    const result = getService().dismiss(input.id);
    if (!result.success) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Nudge '${input.id}' is not pending or does not exist`,
      });
    }
    return result;
  }),

  /** Act on a pending nudge — execute its suggested action. */
  act: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    const result = getService().act(input.id);
    if (!result.success) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Nudge '${input.id}' is not pending or does not exist`,
      });
    }
    return { result: { success: true, nudge: result.nudge } };
  }),

  /** Trigger an on-demand nudge scan. */
  scan: protectedProcedure
    .input(
      z
        .object({
          type: nudgeTypeSchema.optional(),
        })
        .optional()
    )
    .mutation(async ({ input }) => {
      return getService().scan(input?.type ?? undefined);
    }),

  /** Update detection thresholds. */
  configure: protectedProcedure
    .input(
      z.object({
        consolidationSimilarity: z.number().min(0).max(1).optional(),
        consolidationMinCluster: z.number().int().positive().optional(),
        stalenessDays: z.number().int().positive().optional(),
        patternMinOccurrences: z.number().int().positive().optional(),
        maxPendingNudges: z.number().int().positive().optional(),
        nudgeCooldownHours: z.number().positive().optional(),
      })
    )
    .mutation(({ input }) => {
      activeThresholds = { ...activeThresholds, ...input };
      return { success: true };
    }),
});
