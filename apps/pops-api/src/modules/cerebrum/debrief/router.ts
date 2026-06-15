/**
 * Cerebrum-side debrief writer surface.
 *
 * Option D step 2 of the MEDIA pillar exit (PR #3111). The MEDIA pillar
 * still owns the watch-history transaction (`logWatch`), but cerebrum
 * now owns the *post-watch* fan-out: creating the debrief session row
 * and queueing one debrief_status entry per active dimension. Step 1
 * (#3119) denormalised `(media_type, media_id)` onto `debrief_sessions`
 * so this writer can populate the columns directly; step 3 physically
 * moves the debrief tables into `cerebrum.db` and replaces the media
 * side's in-tx `getDebriefByMedia` call with a `logWatchCompletion`
 * invocation, retiring the cross-pillar transaction.
 *
 * Idempotency: both child calls are individually idempotent —
 * `createDebriefSession` deletes any prior pending/active row for the
 * same media before inserting, and `queueDebriefStatus` upserts on
 * `(media_type, media_id, dimension_id)` and resets `debriefed` /
 * `dismissed` to 0. Calling `logWatchCompletion` twice for the same
 * `(watchHistoryId, mediaType, mediaId)` therefore converges on a
 * single pending debrief row with reset status counters.
 *
 * The wrapping `getCerebrumDrizzle().transaction(...)` is the
 * forward-compatible call shape: in env-scope test fixtures it collapses
 * onto the shared pops.db connection so the writes are genuinely atomic
 * today, and in production it becomes a real cross-table boundary once
 * step 3 lands and `debrief_sessions` / `debrief_status` are physically
 * owned by `cerebrum.db`. After the Theme-13 Wave-5 cascade the inner
 * services resolve `getCerebrumDrizzle()` themselves — atomicity within
 * the cerebrum-side fan-out is therefore guaranteed on the same singleton
 * connection.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import {
  DebriefSessionSchema,
  GetByMediaInputSchema,
  GetInputSchema,
  ListPendingInputSchema,
} from '@pops/cerebrum-contract/schemas';
import { debriefResults, debriefSessions } from '@pops/cerebrum-db';

import { getCerebrumDrizzle } from '../../../db/cerebrum-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { createDebriefSession, queueDebriefStatus } from '../../media/debrief/service.js';

const DEFAULT_LIST_PENDING_LIMIT = 50;

const LogWatchCompletionSchema = z.object({
  mediaType: z.enum(['movie', 'episode']),
  mediaId: z.number().int().positive(),
  watchHistoryId: z.number().int().positive(),
});

const DebriefSessionNullableResponseSchema = z.object({
  data: DebriefSessionSchema.nullable(),
});
const PaginationMetaSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
const ListPendingResponseSchema = z.object({
  data: z.array(DebriefSessionSchema),
  pagination: PaginationMetaSchema,
});

const DismissSchema = z.object({
  sessionId: z.number().int().positive(),
});

const DeleteByWatchHistoryIdSchema = z.object({
  watchHistoryId: z.number().int().positive(),
});

export type LogWatchCompletionInput = z.infer<typeof LogWatchCompletionSchema>;
export type DismissInput = z.infer<typeof DismissSchema>;
export type DeleteByWatchHistoryIdInput = z.infer<typeof DeleteByWatchHistoryIdSchema>;

export interface LogWatchCompletionResult {
  sessionId: number;
  dimensionsQueued: number;
}

export interface DeleteByWatchHistoryIdResult {
  deletedSessions: number;
  deletedResults: number;
}

export function logWatchCompletion(input: LogWatchCompletionInput): LogWatchCompletionResult {
  const db = getCerebrumDrizzle();
  return db.transaction(() => {
    const sessionId = createDebriefSession(input.watchHistoryId);
    const dimensionsQueued = queueDebriefStatus(input.mediaType, input.mediaId);
    return { sessionId, dimensionsQueued };
  });
}

/**
 * Dismiss a debrief session — transitions it to `status = 'complete'`.
 * Idempotent on an already-complete session. Throws NOT_FOUND for an
 * unknown id. See `apps/pops-cerebrum-api/src/modules/debrief/router.ts`
 * for the canonical contract; this in-monolith binding matches the
 * cerebrum-api shape one-to-one (PRD-248 US-04).
 */
export function dismissDebriefSession(input: DismissInput): typeof debriefSessions.$inferSelect {
  const db = getCerebrumDrizzle();
  return db.transaction((tx) => {
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
}

/**
 * Cascade-delete debrief rows pinned to a watch_history id. The
 * cerebrum baseline migration drops `debrief_results.session_id`'s FK
 * (so the cerebrum SQLite file can stand alone), so cascade is
 * explicit: delete dependent results first, then sessions. Returns
 * `{ deletedSessions: 0, deletedResults: 0 }` when the watch row has
 * no debrief — not an error. PRD-248 US-04 contract.
 */
export function deleteDebriefByWatchHistoryId(
  input: DeleteByWatchHistoryIdInput
): DeleteByWatchHistoryIdResult {
  const db = getCerebrumDrizzle();
  return db.transaction((tx) => {
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
}

export const debriefRouter = router({
  /**
   * Post-watch debrief fan-out. Called by the MEDIA pillar after a
   * completed watch lands; creates the debrief session and queues
   * debrief_status rows. Safe to call more than once for the same
   * `(watchHistoryId, mediaType, mediaId)` — see file header.
   */
  logWatchCompletion: protectedProcedure
    .input(LogWatchCompletionSchema)
    .mutation(({ input }) => logWatchCompletion(input)),

  /**
   * Fetch a single debrief session by id. Returns `{ data: null }` when
   * the session is missing (PRD-248 US-03: clean null shape for benign
   * no-session reads instead of NOT_FOUND).
   */
  get: protectedProcedure
    .input(GetInputSchema)
    .output(DebriefSessionNullableResponseSchema)
    .query(({ input }) => {
      const db = getCerebrumDrizzle();
      const row = db
        .select()
        .from(debriefSessions)
        .where(eq(debriefSessions.id, input.sessionId))
        .get();
      if (!row) return { data: null };
      return { data: DebriefSessionSchema.parse(row) };
    }),

  /**
   * Return the most recent pending/active session for a media tuple,
   * read directly off the denormalised `(media_type, media_id)` columns
   * on `debrief_sessions` (commit 9df171fe). No cross-pillar join.
   */
  getByMedia: protectedProcedure
    .input(GetByMediaInputSchema)
    .output(DebriefSessionNullableResponseSchema)
    .query(({ input }) => {
      const db = getCerebrumDrizzle();
      const row = db
        .select()
        .from(debriefSessions)
        .where(
          and(
            eq(debriefSessions.mediaType, input.mediaType),
            eq(debriefSessions.mediaId, input.mediaId),
            inArray(debriefSessions.status, ['pending', 'active'])
          )
        )
        .orderBy(desc(debriefSessions.createdAt), desc(debriefSessions.id))
        .get();
      if (!row) return { data: null };
      return { data: DebriefSessionSchema.parse(row) };
    }),

  /**
   * Paginated list of pending sessions, optionally narrowed by
   * `(mediaType, mediaId)`. `total` reports the count across the full
   * filter so the caller can paginate without a second round-trip.
   */
  listPending: protectedProcedure
    .input(ListPendingInputSchema)
    .output(ListPendingResponseSchema)
    .query(({ input }) => {
      const db = getCerebrumDrizzle();
      const filters = [eq(debriefSessions.status, 'pending')];
      if (input.mediaType !== undefined) {
        filters.push(eq(debriefSessions.mediaType, input.mediaType));
      }
      if (input.mediaId !== undefined) {
        filters.push(eq(debriefSessions.mediaId, input.mediaId));
      }
      const whereClause = and(...filters);

      const limit = input.limit ?? DEFAULT_LIST_PENDING_LIMIT;
      const offset = input.offset ?? 0;

      const rows = db
        .select()
        .from(debriefSessions)
        .where(whereClause)
        .orderBy(desc(debriefSessions.createdAt), desc(debriefSessions.id))
        .limit(limit)
        .offset(offset)
        .all();

      const totalRow = db
        .select({ id: debriefSessions.id })
        .from(debriefSessions)
        .where(whereClause)
        .all();

      return {
        data: rows.map((row) => DebriefSessionSchema.parse(row)),
        pagination: { limit, offset, total: totalRow.length },
      };
    }),

  /**
   * Dismiss a debrief session. Mirrors the cerebrum-api shape so the
   * in-monolith dispatcher binding (`cerebrum.debrief.dismiss`)
   * resolves identically — `pillar('cerebrum').debrief.dismiss` PRD-248
   * US-05 will lift the call sites to the SDK without wire churn.
   */
  dismiss: protectedProcedure
    .input(DismissSchema)
    .mutation(({ input }) => ({ data: dismissDebriefSession(input) })),

  /**
   * Cascade-delete debrief rows pinned to a watch_history id. The
   * lockstep in-monolith binding for the cerebrum-api US-04 surface.
   */
  deleteByWatchHistoryId: protectedProcedure
    .input(DeleteByWatchHistoryIdSchema)
    .mutation(({ input }) => deleteDebriefByWatchHistoryId(input)),
});
