/**
 * Delete procedures for `cerebrum.debrief.*`: `dismiss` and
 * `deleteByWatchHistoryId` (PRD-248 US-04).
 *
 * Split out of `router.ts` to keep each module under the oxlint
 * `max-lines` ceiling.
 */
import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';

import {
  DebriefSessionSchema,
  DeleteByWatchHistoryIdInputSchema,
  DismissInputSchema,
} from '@pops/cerebrum-contract/schemas';
import { debriefResults, debriefSessions } from '@pops/cerebrum-db';

import { protectedProcedure } from '../../../trpc.js';
import {
  DebriefSessionResponseSchema,
  DeleteByWatchHistoryIdResponseSchema,
  type DebriefSession,
} from '../schemas.js';

/**
 * Dismiss a debrief session (PRD-248 US-04).
 *
 * Transitions the session to `status = 'complete'` — the terminal
 * state that the rest of the debrief surface treats as "no further
 * action expected". The session row itself has no `dismissed`
 * boolean (the `dismissed` flag lives on the per-(media, dimension)
 * `debrief_status` rows queued by `logWatchCompletion`); 'complete'
 * is the session-level dismissed marker for the SDK contract.
 *
 * Idempotent: re-dismissing an already-complete session is a no-op
 * and returns the existing row. Throws NOT_FOUND for an unknown
 * sessionId — `dismiss` is a state-changing call, so the typed 404
 * is the right shape (contrast with `get`, which is a read and
 * returns null).
 *
 * The status update is wrapped in a cerebrum-side transaction even
 * though it is a single statement: it keeps the surface uniform
 * with the rest of the writer router and is the forward-compatible
 * shape for adding the eventual `debrief_status.dismissed = 1`
 * fan-out without changing the wire contract.
 */
const dismiss = protectedProcedure
  .input(DismissInputSchema)
  .output(DebriefSessionResponseSchema)
  .mutation(({ input, ctx }) => {
    const row = ctx.cerebrumDb.transaction((tx) => {
      const existing = tx
        .select()
        .from(debriefSessions)
        .where(eq(debriefSessions.id, input.sessionId))
        .get();
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Debrief session '${input.sessionId}' not found`,
        });
      }
      if (existing.status === 'complete') {
        return existing;
      }
      tx.update(debriefSessions)
        .set({ status: 'complete' })
        .where(eq(debriefSessions.id, input.sessionId))
        .run();
      const updated = tx
        .select()
        .from(debriefSessions)
        .where(eq(debriefSessions.id, input.sessionId))
        .get();
      if (!updated) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to read back debrief session ${input.sessionId} after dismiss`,
        });
      }
      return updated;
    });
    const parsed: DebriefSession = DebriefSessionSchema.parse(row);
    return { data: parsed };
  });

/**
 * Cascade-delete debrief rows pinned to a given watch_history id
 * (PRD-248 US-04).
 *
 * The cerebrum baseline migration (`0055_debrief_baseline.sql`)
 * intentionally drops the `debrief_results.session_id` FK so the
 * cerebrum SQLite file can stand alone without cross-pillar FK
 * references. Cascade therefore happens explicitly here: delete the
 * dependent `debrief_results` rows first, then the
 * `debrief_sessions` rows. Both deletes run inside a single
 * cerebrum-side transaction so a partial failure leaves the
 * starting state intact.
 *
 * Returns the row counts the SDK consumer needs to surface in logs
 * / metrics. Calling for a watch_history id with no debrief rows
 * returns `{ deletedSessions: 0, deletedResults: 0 }` — not an
 * error.
 */
const deleteByWatchHistoryId = protectedProcedure
  .input(DeleteByWatchHistoryIdInputSchema)
  .output(DeleteByWatchHistoryIdResponseSchema)
  .mutation(({ input, ctx }) => {
    return ctx.cerebrumDb.transaction((tx) => {
      const sessionIds = tx
        .select({ id: debriefSessions.id })
        .from(debriefSessions)
        .where(eq(debriefSessions.watchHistoryId, input.watchHistoryId))
        .all()
        .map((row) => row.id);

      if (sessionIds.length === 0) {
        return { deletedSessions: 0, deletedResults: 0 };
      }

      const resultsDelete = tx
        .delete(debriefResults)
        .where(inArray(debriefResults.sessionId, sessionIds))
        .run();

      const sessionsDelete = tx
        .delete(debriefSessions)
        .where(eq(debriefSessions.watchHistoryId, input.watchHistoryId))
        .run();

      return {
        deletedSessions: Number(sessionsDelete.changes),
        deletedResults: Number(resultsDelete.changes),
      };
    });
  });

export const deleteProcedures = {
  dismiss,
  deleteByWatchHistoryId,
};
