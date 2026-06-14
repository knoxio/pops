import { count, desc, eq, or } from 'drizzle-orm';

import { debriefResults, debriefSessions } from '@pops/cerebrum-db';
import { comparisonDimensions, movies, watchHistory } from '@pops/media-db';

import { getCerebrumDrizzle } from '../../../../db/cerebrum-handle.js';
import { getMediaDrizzle } from '../../../../db/media-db-handle.js';
import { resolveMoviePoster } from '../pairs/movie-helpers.js';

import type { PendingDebrief } from '../types.js';

interface SessionRow {
  sessionId: number;
  status: string;
  watchHistoryId: number;
  createdAt: string;
}

function fetchPendingSessions(): SessionRow[] {
  const db = getCerebrumDrizzle();
  return db
    .select({
      sessionId: debriefSessions.id,
      status: debriefSessions.status,
      watchHistoryId: debriefSessions.watchHistoryId,
      createdAt: debriefSessions.createdAt,
    })
    .from(debriefSessions)
    .where(or(eq(debriefSessions.status, 'pending'), eq(debriefSessions.status, 'active')))
    .orderBy(desc(debriefSessions.createdAt))
    .all();
}

function getActiveDimensionCount(): number {
  const db = getMediaDrizzle();
  return (
    db
      .select({ total: count() })
      .from(comparisonDimensions)
      .where(eq(comparisonDimensions.active, 1))
      .all()[0]?.total ?? 0
  );
}

function getCompletedResultCount(sessionId: number): number {
  const db = getCerebrumDrizzle();
  return (
    db
      .select({ total: count() })
      .from(debriefResults)
      .where(eq(debriefResults.sessionId, sessionId))
      .all()[0]?.total ?? 0
  );
}

function buildPendingFromSession(
  session: SessionRow,
  activeDimCount: number
): PendingDebrief | null {
  const mediaDb = getMediaDrizzle();
  const whEntry = mediaDb
    .select({
      mediaType: watchHistory.mediaType,
      mediaId: watchHistory.mediaId,
    })
    .from(watchHistory)
    .where(eq(watchHistory.id, session.watchHistoryId))
    .get();

  if (!whEntry || whEntry.mediaType !== 'movie') return null;

  const movieRow = mediaDb
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, whEntry.mediaId))
    .get();

  if (!movieRow) return null;

  const completedCount = getCompletedResultCount(session.sessionId);
  const pendingDimensionCount = Math.max(0, activeDimCount - completedCount);

  return {
    sessionId: session.sessionId,
    movieId: movieRow.id,
    title: movieRow.title,
    posterUrl: resolveMoviePoster(movieRow),
    status: session.status as 'pending' | 'active',
    createdAt: session.createdAt,
    pendingDimensionCount,
  };
}

/**
 * Get all movies with pending or active debrief sessions.
 * Joins debrief_sessions → watch_history → movies and counts
 * how many dimensions still need results per session.
 */
export function getPendingDebriefs(): PendingDebrief[] {
  const sessions = fetchPendingSessions();
  if (sessions.length === 0) return [];
  const activeDimCount = getActiveDimensionCount();
  const results: PendingDebrief[] = [];
  for (const session of sessions) {
    const pending = buildPendingFromSession(session, activeDimCount);
    if (pending) results.push(pending);
  }
  return results;
}
