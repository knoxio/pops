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
import { z } from 'zod';

import { getDrizzle } from '../../../db.js';
import { logger } from '../../../lib/logger.js';
import { trpcError } from '../../../shared/trpc-error.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { getEngramService } from '../instance.js';
import { HybridSearchService } from '../retrieval/hybrid-search.js';
import { ConsolidationDetector } from './detectors/consolidation.js';
import { LlmContradictionAnalyzer } from './detectors/contradiction-analyzer.js';
import { PatternDetector } from './detectors/patterns.js';
import { StalenessDetector } from './detectors/staleness.js';
import { NudgeService } from './nudge-service.js';
import { getDefaultNudgeThresholds } from './types.js';

import type { NudgeThresholds } from './types.js';

/** Module-scoped thresholds — mutated by `configure`, shared across requests. */
let activeThresholds: NudgeThresholds = getDefaultNudgeThresholds();

/** Build a NudgeService for the current request context. */
function getService(): NudgeService {
  const db = getDrizzle();
  const searchService = new HybridSearchService(db);
  const engramService = getEngramService();
  const patternDetector = new PatternDetector({
    thresholds: activeThresholds,
    contradictionAnalyzer: new LlmContradictionAnalyzer(),
    bodyReader: (engramId) => {
      try {
        return engramService.read(engramId).body;
      } catch (err) {
        // A thrown read (deleted engram, IO failure, secret-scope guard)
        // surfaces here. We swallow the throw so the detector pass keeps
        // running, but we log so silent gaps in contradiction coverage
        // are observable.
        logger.warn({ err, engramId }, '[contradictions] failed to read engram body');
        return null;
      }
    },
  });
  return new NudgeService({
    db,
    searchService,
    consolidationDetector: new ConsolidationDetector(searchService, activeThresholds),
    stalenessDetector: new StalenessDetector(activeThresholds),
    patternDetector,
    thresholds: activeThresholds,
    engramService,
  });
}

const nudgeTypeSchema = z.enum(['consolidation', 'staleness', 'pattern', 'insight']);
const nudgeStatusSchema = z.enum(['pending', 'dismissed', 'acted', 'expired']);
const nudgePrioritySchema = z.enum(['low', 'medium', 'high']);

/**
 * Type guard that extracts contradiction evidence from a nudge action.
 *
 * Contradiction evidence is stored on `Nudge.action.params.contradiction`
 * when the underlying pattern is a contradiction. Other pattern nudges
 * (recurring/emerging) carry no contradiction field, so this returns null.
 */
function extractContradiction(params: Record<string, unknown> | undefined): {
  engramA: string;
  engramB: string;
  excerptA: string;
  excerptB: string;
  conflict: string;
} | null {
  if (!params) return null;
  const raw = params['contradiction'];
  if (!raw || typeof raw !== 'object') return null;
  const evidence = raw as Record<string, unknown>;
  const fields = ['engramA', 'engramB', 'excerptA', 'excerptB', 'conflict'] as const;
  for (const field of fields) {
    if (typeof evidence[field] !== 'string' || (evidence[field] as string).length === 0) {
      return null;
    }
  }
  return {
    engramA: evidence['engramA'] as string,
    engramB: evidence['engramB'] as string,
    excerptA: evidence['excerptA'] as string,
    excerptB: evidence['excerptB'] as string,
    conflict: evidence['conflict'] as string,
  };
}

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
      throw trpcError('NOT_FOUND', 'cerebrum.nudge.notFound', { id: input.id });
    }
    return { nudge };
  }),

  /** Dismiss a pending nudge. */
  dismiss: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    const result = getService().dismiss(input.id);
    if (!result.success) {
      throw trpcError('BAD_REQUEST', 'cerebrum.nudge.notPendingOrMissing', { id: input.id });
    }
    return result;
  }),

  /** Act on a pending nudge — execute its suggested action. */
  act: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ input }) => {
    const result = await getService().act(input.id);
    if (!result.success) {
      throw trpcError('BAD_REQUEST', 'cerebrum.nudge.notPendingOrMissing', { id: input.id });
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

  /**
   * List pattern contradictions with structured excerpts (PRD-084 US-03).
   *
   * Surfaces every contradiction-type pattern nudge with both engram IDs,
   * a short verbatim excerpt from each side, and the LLM conflict summary.
   * Status filter defaults to `pending` so the dashboard does not surface
   * already-acted or dismissed contradictions; pass `null` to include all.
   */
  contradictions: protectedProcedure
    .input(
      z
        .object({
          status: nudgeStatusSchema.nullable().optional(),
          limit: z.number().int().positive().max(100).optional(),
          offset: z.number().int().nonnegative().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      const status = input?.status === undefined ? 'pending' : input.status;
      // Filtering happens at the SQL layer (json_extract on
      // action_params) so the page slice contains only contradictions
      // and `total` is the count of contradictions — not the count of
      // all pattern nudges. Without that, recurring/emerging rows could
      // fill a page and hide actual contradictions.
      const result = getService().listContradictions({
        status,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
      const contradictions = result.nudges
        .map((nudge) => {
          const evidence = extractContradiction(nudge.action?.params);
          if (!evidence) return null;
          return {
            id: nudge.id,
            createdAt: nudge.createdAt,
            status: nudge.status,
            priority: nudge.priority,
            title: nudge.title,
            ...evidence,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      return { contradictions, total: result.total };
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
