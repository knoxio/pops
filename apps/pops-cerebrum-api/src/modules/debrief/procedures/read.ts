/**
 * Read procedures for `cerebrum.debrief.*`: `get`, `getByMedia`, and
 * `listPending`. Split out of `router.ts` (PRD-248 US-04 follow-up)
 * to keep the file under the oxlint `max-lines` ceiling.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';

import {
  DebriefSessionSchema,
  GetByMediaInputSchema,
  GetInputSchema,
  ListPendingInputSchema,
} from '@pops/cerebrum-contract/schemas';
import { debriefSessions } from '@pops/cerebrum-db';

import { protectedProcedure } from '../../../trpc.js';
import { findSessionById } from '../helpers.js';
import {
  DEFAULT_LIST_PENDING_LIMIT,
  DebriefSessionNullableResponseSchema,
  ListPendingResponseSchema,
} from '../schemas.js';

/**
 * Fetch a single debrief session by id. Returns `{ data: null }` when
 * the session does not exist (PRD-248 US-03: clean null shape over
 * the wire instead of NOT_FOUND for benign no-session reads).
 */
const get = protectedProcedure
  .input(GetInputSchema)
  .output(DebriefSessionNullableResponseSchema)
  .query(({ input, ctx }) => {
    const row = findSessionById(ctx.cerebrumDb, input.sessionId);
    if (!row) return { data: null };
    return { data: DebriefSessionSchema.parse(row) };
  });

/**
 * Return the most recent pending/active session for a media tuple,
 * read directly off the denormalised `(media_type, media_id)` columns
 * on `debrief_sessions` (commit 9df171fe). No cross-pillar join.
 * Ordered by `createdAt desc` then `id desc` to break ties on the
 * second-resolution sqlite timestamp.
 */
const getByMedia = protectedProcedure
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
  });

/**
 * Paginated list of pending sessions, optionally narrowed by media
 * tuple. Default limit matches the in-monolith `media/debrief`
 * pagination shape. `total` reports the count across the full filter
 * (not the page) so callers can build pagers without a second call.
 */
const listPending = protectedProcedure
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
  });

export const readProcedures = {
  get,
  getByMedia,
  listPending,
};
