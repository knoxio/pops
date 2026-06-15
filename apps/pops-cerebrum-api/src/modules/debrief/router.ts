/**
 * `cerebrum.debrief.*` write surface for the cerebrum pillar container
 * (PRD-248 US-02 + US-04). Mounts `record`, `create`,
 * `logWatchCompletion`, `dismiss`, and `deleteByWatchHistoryId` as
 * protected mutations under `cerebrumRouter.debrief`.
 *
 * Input/output zod schemas are imported from `@pops/cerebrum-contract`
 * (US-01); the table writes target `@pops/cerebrum-db` directly through
 * the per-request `ctx.cerebrumDb` handle injected by the cerebrum-api
 * trpc context factory.
 *
 * Mixed-tx coordination (Option D, see
 * `docs/themes/13-pillar-finale/notes/server-pillar-sdk-consumer-pattern.md`
 * §6): the procedures here MUST NOT span pillar boundaries. They commit
 * purely within `cerebrum.db`. The media-pillar call sites (PRD-248
 * US-05) commit their watch_history / mediaWatchlist writes FIRST and
 * then call this SDK; idempotent retries (and a future reconciler)
 * absorb partial failure.
 *
 * The cerebrum-api container has no media-db handle and therefore can
 * not enumerate `comparison_dimensions` when `logWatchCompletion` runs.
 * The status fan-out (`queueDebriefStatus` in the in-monolith
 * implementation) is intentionally deferred: this surface returns
 * `dimensionsQueued: 0`. The in-monolith dispatcher binding under
 * `apps/pops-api/src/modules/cerebrum/debrief/` keeps serving real
 * traffic with the status fan-out until PRD-248 US-05 reshapes the
 * call-sites and (if needed) introduces a media→cerebrum dimension
 * SDK shape. PRD-248 §"Surface inventory" lists the eight methods;
 * US-02 is the write slice.
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import {
  CreateInputSchema,
  DebriefResultSchema,
  DebriefSessionSchema,
  DeleteByWatchHistoryIdInputSchema,
  DismissInputSchema,
  GetByMediaInputSchema,
  GetInputSchema,
  ListPendingInputSchema,
  LogWatchCompletionInputSchema,
  RecordInputSchema,
} from '@pops/cerebrum-contract/schemas';
import { debriefResults, debriefSessions } from '@pops/cerebrum-db';

import { protectedProcedure, router } from '../../trpc.js';

import type { CerebrumDb } from '@pops/cerebrum-db';

const DEFAULT_LIST_PENDING_LIMIT = 50;

const DebriefResultResponseSchema = z.object({ data: DebriefResultSchema });
const DebriefSessionResponseSchema = z.object({ data: DebriefSessionSchema });
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
const LogWatchCompletionResponseSchema = z.object({
  sessionId: z.number().int().positive(),
  dimensionsQueued: z.number().int().nonnegative(),
});
const DeleteByWatchHistoryIdResponseSchema = z.object({
  deletedSessions: z.number().int().nonnegative(),
  deletedResults: z.number().int().nonnegative(),
});

type DebriefSession = z.infer<typeof DebriefSessionSchema>;
type DebriefResult = z.infer<typeof DebriefResultSchema>;
type DebriefSessionRow = typeof debriefSessions.$inferSelect;

function findSessionById(db: CerebrumDb, sessionId: number): DebriefSessionRow | undefined {
  return db.select().from(debriefSessions).where(eq(debriefSessions.id, sessionId)).get();
}

/**
 * Delete any prior pending/active session for the given media tuple,
 * then insert a fresh pending session. Matches the legacy
 * `createDebriefSession` idempotency contract: re-running it for the
 * same `(mediaType, mediaId)` converges on exactly one pending row.
 *
 * Wrapped by both `create` and `logWatchCompletion`.
 */
function createOrReplacePendingSession(
  db: CerebrumDb,
  input: { watchHistoryId: number; mediaType: 'movie' | 'episode'; mediaId: number }
): DebriefSession {
  const row = db.transaction((tx) => {
    tx.delete(debriefSessions)
      .where(
        and(
          eq(debriefSessions.mediaType, input.mediaType),
          eq(debriefSessions.mediaId, input.mediaId),
          inArray(debriefSessions.status, ['pending', 'active'])
        )
      )
      .run();

    const insertResult = tx
      .insert(debriefSessions)
      .values({
        watchHistoryId: input.watchHistoryId,
        mediaType: input.mediaType,
        mediaId: input.mediaId,
        status: 'pending',
      })
      .run();

    const insertedId = Number(insertResult.lastInsertRowid);
    const session = tx
      .select()
      .from(debriefSessions)
      .where(eq(debriefSessions.id, insertedId))
      .get();
    if (!session) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to read back debrief session ${insertedId} after insert`,
      });
    }
    return session;
  });
  return DebriefSessionSchema.parse(row);
}

export const debriefRouter = router({
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
  record: protectedProcedure
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
    }),

  /**
   * Create a debrief session pinned to a watch_history row. Deletes any
   * prior pending/active sessions for the same `(mediaType, mediaId)`
   * tuple first; idempotent on retry.
   */
  create: protectedProcedure
    .input(CreateInputSchema)
    .output(DebriefSessionResponseSchema)
    .mutation(({ input, ctx }) => {
      const session = createOrReplacePendingSession(ctx.cerebrumDb, input);
      return { data: session };
    }),

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
  logWatchCompletion: protectedProcedure
    .input(LogWatchCompletionInputSchema)
    .output(LogWatchCompletionResponseSchema)
    .mutation(({ input, ctx }) => {
      const session = createOrReplacePendingSession(ctx.cerebrumDb, input);
      return { sessionId: session.id, dimensionsQueued: 0 };
    }),

  /**
   * Fetch a single debrief session by id. Returns `{ data: null }` when
   * the session does not exist (PRD-248 US-03: clean null shape over
   * the wire instead of NOT_FOUND for benign no-session reads).
   */
  get: protectedProcedure
    .input(GetInputSchema)
    .output(DebriefSessionNullableResponseSchema)
    .query(({ input, ctx }) => {
      const row = findSessionById(ctx.cerebrumDb, input.sessionId);
      if (!row) return { data: null };
      return { data: DebriefSessionSchema.parse(row) };
    }),

  /**
   * Return the most recent pending/active session for a media tuple,
   * read directly off the denormalised `(media_type, media_id)` columns
   * on `debrief_sessions` (commit 9df171fe). No cross-pillar join.
   * Ordered by `createdAt desc` then `id desc` to break ties on the
   * second-resolution sqlite timestamp.
   */
  getByMedia: protectedProcedure
    .input(GetByMediaInputSchema)
    .output(DebriefSessionNullableResponseSchema)
    .query(({ input, ctx }) => {
      const row = ctx.cerebrumDb
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
   * Paginated list of pending sessions, optionally narrowed by media
   * tuple. Default limit matches the in-monolith `media/debrief`
   * pagination shape. `total` reports the count across the full filter
   * (not the page) so callers can build pagers without a second call.
   */
  listPending: protectedProcedure
    .input(ListPendingInputSchema)
    .output(ListPendingResponseSchema)
    .query(({ input, ctx }) => {
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

      const rows = ctx.cerebrumDb
        .select()
        .from(debriefSessions)
        .where(whereClause)
        .orderBy(desc(debriefSessions.createdAt), desc(debriefSessions.id))
        .limit(limit)
        .offset(offset)
        .all();

      const totalRow = ctx.cerebrumDb
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
  dismiss: protectedProcedure
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
    }),

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
  deleteByWatchHistoryId: protectedProcedure
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
    }),
});
