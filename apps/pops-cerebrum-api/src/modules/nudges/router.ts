/**
 * nudge_log read/dismiss router — first writer slice cut over from
 * pops-api into pops-cerebrum-api as part of Phase 5 PR 1 (Track M5).
 *
 * Procedure paths intentionally match
 * `apps/pops-api/src/modules/cerebrum/nudges/router.ts` so the Phase 5
 * PR 2 dispatcher cutover can be a transparent URL swap rather than a
 * procedure-path rename:
 *
 *   - `cerebrum.nudges.list`            protected query
 *   - `cerebrum.nudges.get`             protected query
 *   - `cerebrum.nudges.dismiss`         protected mutation
 *   - `cerebrum.nudges.contradictions`  protected query
 *
 * The cross-pillar procedures (`scan`, `act`, `configure`) stay in the
 * legacy pops-api router for now — they reach into the engrams + retrieval
 * subsystems that have not yet migrated to `@pops/cerebrum-db`. They
 * follow once those slices move.
 *
 * Until the dispatcher swap, the legacy pops-api router keeps serving
 * real traffic — this one is a shadow ready to take over.
 */
import { z } from 'zod';

import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { mapDomainErrors } from '../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../trpc.js';
import { createNudgeReadService } from './service.js';

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
    .query(({ input, ctx }) => {
      return createNudgeReadService(ctx.cerebrumDb).list(input ?? {});
    }),

  get: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(({ input, ctx }) =>
    mapDomainErrors(() => {
      const nudge = createNudgeReadService(ctx.cerebrumDb).get(input.id);
      if (!nudge) throw new NotFoundError('Nudge', input.id);
      return { nudge };
    })
  ),

  /**
   * Dismiss a pending nudge.
   *
   * The legacy pops-api router collapsed missing-vs-already-dismissed
   * into a single `BAD_REQUEST`. The shadow surface tightens that into:
   *   - missing nudge       → NOT_FOUND
   *   - non-pending nudge   → CONFLICT (already dismissed/acted/expired)
   *
   * Both branches surface as a single transition-failed signal at the
   * UI layer; the wire-shape split exists so cerebrum-api consumers can
   * tell a stale UI cache apart from a no-op double-click.
   */
  dismiss: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input, ctx }) =>
      mapDomainErrors(() => {
        const svc = createNudgeReadService(ctx.cerebrumDb);
        const existing = svc.get(input.id);
        if (!existing) throw new NotFoundError('Nudge', input.id);
        if (existing.status !== 'pending') {
          throw new ConflictError(
            `Nudge '${input.id}' is not pending (status=${existing.status}).`
          );
        }
        const result = svc.dismiss(input.id);
        if (!result.success) {
          throw new ConflictError(`Nudge '${input.id}' could not be dismissed.`);
        }
        return result;
      })
    ),

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
    .query(({ input, ctx }) => {
      const status = input?.status === undefined ? 'pending' : input.status;
      const result = createNudgeReadService(ctx.cerebrumDb).listContradictions({
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
});
