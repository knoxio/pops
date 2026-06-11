/**
 * Shelf impressions router — the first writer slice cut over from
 * pops-api into pops-media-api as part of Phase 5 PR 1 (Track M3).
 *
 * Procedure surface mirrors the public functions exposed by
 * `shelfImpressionsService` in `@pops/media-db`:
 *
 *   - `media.shelfImpressions.recordImpressions`    protected  mutation
 *   - `media.shelfImpressions.getRecentImpressions` protected  query
 *   - `media.shelfImpressions.getShelfFreshness`    protected  query
 *   - `media.shelfImpressions.cleanup`              protected  mutation
 *
 * Domain errors from `@pops/media-db` (none today, but future slice
 * migrations may raise NotFound/Conflict shapes) are translated to local
 * `HttpError` subclasses and routed through `mapDomainErrors*` so the
 * tRPC layer sees a proper `TRPCError` with the right wire-level code.
 *
 * Until Phase 5 PR 2 flips the dispatcher / nginx routing rules, the
 * legacy pops-api `assembleSession` procedure keeps calling
 * `shelfImpressionsService` directly — this router is a shadow ready to
 * take over.
 */
import { z } from 'zod';

import { shelfImpressionsService } from '@pops/media-db';

import { NotFoundError } from '../../shared/errors.js';
import { mapDomainErrors } from '../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../trpc.js';
import {
  CleanupResultSchema,
  GetRecentImpressionsInputSchema,
  GetRecentImpressionsResultSchema,
  GetShelfFreshnessInputSchema,
  GetShelfFreshnessResultSchema,
  RecordImpressionsInputSchema,
  RecordImpressionsResultSchema,
} from './types.js';

export const shelfImpressionsRouter = router({
  recordImpressions: protectedProcedure
    .input(RecordImpressionsInputSchema)
    .output(RecordImpressionsResultSchema)
    .mutation(({ input, ctx }) =>
      mapDomainErrors(() => {
        shelfImpressionsService.recordImpressions(ctx.mediaDb, input.shelfIds);
        return { ok: true as const, recorded: input.shelfIds.length };
      })
    ),

  getRecentImpressions: protectedProcedure
    .input(GetRecentImpressionsInputSchema)
    .output(GetRecentImpressionsResultSchema)
    .query(({ input, ctx }) =>
      mapDomainErrors(() => {
        const counts = shelfImpressionsService.getRecentImpressions(ctx.mediaDb, input.days);
        return {
          windowDays: input.days,
          entries: Array.from(counts, ([shelfId, impressionCount]) => ({
            shelfId,
            impressionCount,
          })),
        };
      })
    ),

  /**
   * Look up the current impression count + freshness multiplier for a
   * given shelf instance. Throws NOT_FOUND when the shelf has zero
   * impressions in the requested window — callers that want the
   * "untouched freshness floor" should use `getShelfFreshnessOrDefault`
   * (not exposed here yet).
   */
  getShelfFreshness: protectedProcedure
    .input(GetShelfFreshnessInputSchema)
    .output(GetShelfFreshnessResultSchema)
    .query(({ input, ctx }) =>
      mapDomainErrors(() => {
        const counts = shelfImpressionsService.getRecentImpressions(ctx.mediaDb, input.days);
        const impressionCount = counts.get(input.shelfId);
        if (impressionCount === undefined) {
          throw new NotFoundError('ShelfImpression', input.shelfId);
        }
        return {
          shelfId: input.shelfId,
          impressionCount,
          freshness: shelfImpressionsService.getShelfFreshness(impressionCount),
        };
      })
    ),

  /**
   * Run the retention cleanup once. Idempotent — safe to call from a cron
   * tick or operator runbook.
   */
  cleanup: protectedProcedure
    .input(z.object({}).optional())
    .output(CleanupResultSchema)
    .mutation(({ ctx }) =>
      mapDomainErrors(() => {
        shelfImpressionsService.cleanupOldImpressions(ctx.mediaDb);
        return { ok: true as const };
      })
    ),
});
