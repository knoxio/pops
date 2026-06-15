/**
 * Write procedures for `cerebrum.debrief.*`: `record`, `create`, and
 * `logWatchCompletion`. Split out of `router.ts` (PRD-248 US-04
 * follow-up) so the file stays under the oxlint `max-lines` ceiling.
 *
 * See `router.ts` for the surface-level rationale and the Option D
 * mixed-tx coordination notes.
 */
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import {
  CreateInputSchema,
  DebriefResultSchema,
  LogWatchCompletionInputSchema,
  RecordInputSchema,
} from '@pops/cerebrum-contract/schemas';
import { debriefResults } from '@pops/cerebrum-db';

import { protectedProcedure } from '../../../trpc.js';
import { createOrReplacePendingSession, findSessionById } from '../helpers.js';
import {
  DebriefResultResponseSchema,
  DebriefSessionResponseSchema,
  LogWatchCompletionResponseSchema,
  type DebriefResult,
} from '../schemas.js';

/**
 * Insert a single `debriefResults` row for a (session, dimension)
 * pair. Returns the inserted row. Throws NOT_FOUND if the session
 * does not exist (the row would violate the intra-cerebrum FK on
 * insert; we surface the typed error up-front rather than letting
 * sqlite raise an opaque integrity error).
 *
 * `comparisonId` is allowed to be null (the dimension was dismissed
 * / skipped) per the contract schema.
 */
const record = protectedProcedure
  .input(RecordInputSchema)
  .output(DebriefResultResponseSchema)
  .mutation(({ input, ctx }) => {
    const session = findSessionById(ctx.cerebrumDb, input.sessionId);
    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Debrief session '${input.sessionId}' not found`,
      });
    }

    const insertResult = ctx.cerebrumDb
      .insert(debriefResults)
      .values({
        sessionId: input.sessionId,
        dimensionId: input.dimensionId,
        comparisonId: input.comparisonId,
      })
      .run();

    const insertedId = Number(insertResult.lastInsertRowid);
    const row = ctx.cerebrumDb
      .select()
      .from(debriefResults)
      .where(eq(debriefResults.id, insertedId))
      .get();
    if (!row) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to read back debrief result ${insertedId} after insert`,
      });
    }
    const parsed: DebriefResult = DebriefResultSchema.parse(row);
    return { data: parsed };
  });

/**
 * Create a debrief session pinned to a watch_history row. Deletes any
 * prior pending/active sessions for the same `(mediaType, mediaId)`
 * tuple first; idempotent on retry.
 */
const create = protectedProcedure
  .input(CreateInputSchema)
  .output(DebriefSessionResponseSchema)
  .mutation(({ input, ctx }) => {
    const session = createOrReplacePendingSession(ctx.cerebrumDb, input);
    return { data: session };
  });

/**
 * Option D entry point. Currently writes the session row only; the
 * status fan-out (`debriefStatus` per active dimension) is deferred
 * to the in-monolith dispatcher binding until PRD-248 US-05 reshapes
 * the cross-pillar dimension lookup (the cerebrum-api container has
 * no media-db handle and `comparison_dimensions` lives in
 * `media.db`).
 *
 * Wire shape matches the OpenAPI snapshot from US-01:
 * `{ sessionId, dimensionsQueued }`. `dimensionsQueued` is `0` for
 * now; the field stays on the shape so US-05's call-site flip is a
 * pure consumer move (no wire-shape churn).
 */
const logWatchCompletion = protectedProcedure
  .input(LogWatchCompletionInputSchema)
  .output(LogWatchCompletionResponseSchema)
  .mutation(({ input, ctx }) => {
    const session = createOrReplacePendingSession(ctx.cerebrumDb, input);
    return { sessionId: session.id, dimensionsQueued: 0 };
  });

export const writeProcedures = {
  record,
  create,
  logWatchCompletion,
};
