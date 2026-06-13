import { and, asc, eq, inArray } from 'drizzle-orm';

/**
 * Debrief service — auto-queue and manage post-watch debrief sessions.
 * Theme-13 Wave-5 cascade: debrief tables routed through
 * `getCerebrumDrizzle()`, `watch_history` / `movies` via `getMediaDrizzle()`,
 * `comparison_dimensions` still on shared `getDrizzle()`.
 */
import { debriefResults, debriefSessions } from '@pops/cerebrum-db';
import { comparisonDimensions } from '@pops/db-types';
import { movies, watchHistory } from '@pops/media-db';

import { getDrizzle } from '../../../db.js';
import { getCerebrumDrizzle } from '../../../db/cerebrum-handle.js';
import { getMediaDrizzle } from '../../../db/media-db-handle.js';
import { NotFoundError } from '../../../shared/errors.js';
import { getDebriefOpponent } from '../comparisons/service.js';

import type { DebriefDimension, DebriefResponse, MovieMetaRow } from './types.js';

export type { DebriefDimension, DebriefResponse } from './types.js';

/**
 * Create a pending debrief session for a watch history entry.
 * If the same media already has pending/active sessions (from a previous watch),
 * those are deleted first (re-watch resets debrief state).
 *
 * Returns the new session ID.
 */
export function createDebriefSession(watchHistoryId: number): number {
  const mediaDb = getMediaDrizzle();
  const cerebrumDb = getCerebrumDrizzle();

  const entry = mediaDb
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, watchHistoryId))
    .get();
  if (!entry) {
    throw new Error(`Watch history entry ${watchHistoryId} not found`);
  }

  const existingWatchIds = mediaDb
    .select({ id: watchHistory.id })
    .from(watchHistory)
    .where(
      and(eq(watchHistory.mediaType, entry.mediaType), eq(watchHistory.mediaId, entry.mediaId))
    )
    .all()
    .map((r) => r.id);

  if (existingWatchIds.length > 0) {
    cerebrumDb
      .delete(debriefSessions)
      .where(
        and(
          inArray(debriefSessions.watchHistoryId, existingWatchIds),
          inArray(debriefSessions.status, ['pending', 'active'])
        )
      )
      .run();
  }

  const result = cerebrumDb
    .insert(debriefSessions)
    .values({
      watchHistoryId,
      mediaType: entry.mediaType,
      mediaId: entry.mediaId,
      status: 'pending',
    })
    .run();

  return Number(result.lastInsertRowid);
}

function loadDebriefSessionEntities(sessionId: number): {
  session: typeof debriefSessions.$inferSelect;
  watchEntry: typeof watchHistory.$inferSelect;
  movieRow: MovieMetaRow;
} {
  const cerebrumDb = getCerebrumDrizzle();
  const mediaDb = getMediaDrizzle();
  const session = cerebrumDb
    .select()
    .from(debriefSessions)
    .where(eq(debriefSessions.id, sessionId))
    .get();
  if (!session) throw new NotFoundError('Debrief session', String(sessionId));

  const watchEntry = mediaDb
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, session.watchHistoryId))
    .get();
  if (!watchEntry) {
    throw new NotFoundError('Watch history entry', String(session.watchHistoryId));
  }

  const movieRow = mediaDb
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, watchEntry.mediaId))
    .get();
  if (!movieRow) throw new NotFoundError('Movie', String(watchEntry.mediaId));

  return { session, watchEntry, movieRow };
}

function buildDebriefDimensions(
  sessionId: number,
  watchEntry: typeof watchHistory.$inferSelect
): DebriefDimension[] {
  const sharedDb = getDrizzle();
  const cerebrumDb = getCerebrumDrizzle();
  const dims = sharedDb
    .select()
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .orderBy(asc(comparisonDimensions.sortOrder))
    .all();

  const results = cerebrumDb
    .select()
    .from(debriefResults)
    .where(eq(debriefResults.sessionId, sessionId))
    .all();
  const completedByDimension = new Map(results.map((r) => [r.dimensionId, r.comparisonId]));

  return dims.map((dim) => {
    if (completedByDimension.has(dim.id)) {
      return {
        dimensionId: dim.id,
        name: dim.name,
        status: 'complete' as const,
        comparisonId: completedByDimension.get(dim.id) ?? null,
        opponent: null,
      };
    }
    return {
      dimensionId: dim.id,
      name: dim.name,
      status: 'pending' as const,
      comparisonId: null,
      opponent: getDebriefOpponent(watchEntry.mediaType, watchEntry.mediaId, dim.id),
    };
  });
}

function activateIfPending(
  sessionId: number,
  status: typeof debriefSessions.$inferSelect.status
): typeof debriefSessions.$inferSelect.status {
  if (status !== 'pending') return status;
  const cerebrumDb = getCerebrumDrizzle();
  cerebrumDb
    .update(debriefSessions)
    .set({ status: 'active' })
    .where(eq(debriefSessions.id, sessionId))
    .run();
  return 'active';
}

/**
 * Get a debrief session with movie info, dimensions, and opponents.
 *
 * For each active dimension:
 *  - If a debrief_result exists for that dimension → status = "complete"
 *  - Otherwise → status = "pending", opponent fetched via getDebriefOpponent
 *
 * If the session is "pending", transitions it to "active" on first read.
 */
export function getDebrief(sessionId: number): DebriefResponse {
  const { session, watchEntry, movieRow } = loadDebriefSessionEntities(sessionId);
  const posterUrl =
    movieRow.posterOverridePath ?? `/media/images/movie/${movieRow.tmdbId}/poster.jpg`;
  const dimensions = buildDebriefDimensions(sessionId, watchEntry);
  const currentStatus = activateIfPending(sessionId, session.status);

  return {
    sessionId: session.id,
    status: currentStatus,
    movie: {
      mediaType: watchEntry.mediaType,
      mediaId: watchEntry.mediaId,
      title: movieRow.title,
      posterPath: movieRow.posterPath,
      posterUrl,
    },
    dimensions,
  };
}

/**
 * Look up the most recent pending/active/complete debrief session for a
 * media item via the denormalised `(media_type, media_id)` columns (PR
 * #3119). Throws NotFoundError if no session exists for this media.
 */
export function getDebriefByMedia(
  mediaType: 'movie' | 'episode',
  mediaId: number
): DebriefResponse {
  const db = getCerebrumDrizzle();

  const session = db
    .select({ id: debriefSessions.id })
    .from(debriefSessions)
    .where(
      and(
        eq(debriefSessions.mediaType, mediaType),
        eq(debriefSessions.mediaId, mediaId),
        inArray(debriefSessions.status, ['pending', 'active', 'complete'])
      )
    )
    .orderBy(asc(debriefSessions.id))
    .get();

  if (!session) {
    throw new NotFoundError('Debrief session', `${mediaType}:${mediaId}`);
  }

  return getDebrief(session.id);
}

export { queueDebriefStatus } from './queue-status.js';
