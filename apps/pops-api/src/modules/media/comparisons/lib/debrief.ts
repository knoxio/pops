import {
  comparisonDimensions,
  comparisons,
  debriefResults,
  debriefSessions,
  debriefStatus,
  mediaScores,
  movies,
  watchHistory,
} from '@pops/db-types';
import { and, asc, count, desc, eq, or } from 'drizzle-orm';

import { getDb, getDrizzle } from '../../../../db.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/errors.js';
import { getDimension } from '../dimensions.service.js';
import type {
  ComparisonRow,
  DebriefOpponent,
  PendingDebrief,
  RecordComparisonInput,
  RecordDebriefComparisonInput,
} from '../types.js';

// ── Debrief Opponent Selection ──

/**
 * Select a debrief opponent — the eligible movie closest to the median score
 * for the given dimension.
 *
 * Excludes:
 *  - The debrief movie itself
 *  - Movies excluded from the dimension (excluded = 1)
 *  - Blacklisted movies (watch_history.blacklisted = 1)
 *  - Movies already compared against the debrief movie in this dimension
 */
export function getDebriefOpponent(
  mediaType: string,
  mediaId: number,
  dimensionId: number
): DebriefOpponent | null {
  getDimension(dimensionId); // verify dimension exists

  const db = getDrizzle();

  // Get all non-excluded scores for this dimension
  const allScores = db
    .select()
    .from(mediaScores)
    .where(
      and(
        eq(mediaScores.dimensionId, dimensionId),
        eq(mediaScores.mediaType, mediaType),
        eq(mediaScores.excluded, 0)
      )
    )
    .orderBy(asc(mediaScores.score))
    .all();

  // Get blacklisted movie IDs
  const blacklistedIds = new Set(
    db
      .select({ mediaId: watchHistory.mediaId })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.mediaType, mediaType as 'movie' | 'episode'),
          eq(watchHistory.blacklisted, 1)
        )
      )
      .all()
      .map((r) => r.mediaId)
  );

  // Get IDs of movies already compared against this one in this dimension
  const comparedAgainstIds = new Set<number>();
  const compsA = db
    .select({ mediaBId: comparisons.mediaBId })
    .from(comparisons)
    .where(
      and(
        eq(comparisons.dimensionId, dimensionId),
        eq(comparisons.mediaAType, mediaType),
        eq(comparisons.mediaAId, mediaId)
      )
    )
    .all();
  for (const c of compsA) comparedAgainstIds.add(c.mediaBId);

  const compsB = db
    .select({ mediaAId: comparisons.mediaAId })
    .from(comparisons)
    .where(
      and(
        eq(comparisons.dimensionId, dimensionId),
        eq(comparisons.mediaBType, mediaType),
        eq(comparisons.mediaBId, mediaId)
      )
    )
    .all();
  for (const c of compsB) comparedAgainstIds.add(c.mediaAId);

  // Filter eligible candidates
  const eligible = allScores.filter(
    (s) =>
      s.mediaId !== mediaId && !blacklistedIds.has(s.mediaId) && !comparedAgainstIds.has(s.mediaId)
  );

  if (eligible.length === 0) return null;

  // Find median score
  const medianIndex = Math.floor(eligible.length / 2);
  const medianEntry = eligible[medianIndex];
  if (!medianEntry) return null;
  const medianScore = medianEntry.score;

  // Pick the one closest to median
  let closest = eligible[0];
  if (!closest) return null;
  let closestDist = Math.abs(closest.score - medianScore);
  for (const s of eligible) {
    const dist = Math.abs(s.score - medianScore);
    if (dist < closestDist) {
      closest = s;
      closestDist = dist;
    }
  }

  // Fetch movie metadata
  const movieRow = db
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, closest.mediaId))
    .get();

  if (!movieRow) return null;

  const posterUrl = movieRow.posterOverridePath
    ? movieRow.posterOverridePath
    : movieRow.posterPath
      ? `/media/images/movie/${movieRow.tmdbId}/poster.jpg`
      : null;

  return {
    id: movieRow.id,
    title: movieRow.title,
    posterPath: movieRow.posterPath,
    posterUrl,
  };
}

// ── Pending Debriefs ──

/**
 * Get all movies with pending or active debrief sessions.
 * Joins debrief_sessions → watch_history → movies and counts
 * how many dimensions still need results per session.
 */
export function getPendingDebriefs(): PendingDebrief[] {
  const db = getDrizzle();

  // Get sessions that are pending or active
  const sessions = db
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

  if (sessions.length === 0) return [];

  // Get count of active dimensions
  const activeDimCount =
    db
      .select({ total: count() })
      .from(comparisonDimensions)
      .where(eq(comparisonDimensions.active, 1))
      .all()[0]?.total ?? 0;

  const results: PendingDebrief[] = [];

  for (const session of sessions) {
    // Get watch history entry to find media info
    const whEntry = db
      .select({
        mediaType: watchHistory.mediaType,
        mediaId: watchHistory.mediaId,
      })
      .from(watchHistory)
      .where(eq(watchHistory.id, session.watchHistoryId))
      .get();

    if (!whEntry || whEntry.mediaType !== 'movie') continue;

    // Get movie info
    const movieRow = db
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

    if (!movieRow) continue;

    // Count completed debrief results for this session
    const completedCount =
      db
        .select({ total: count() })
        .from(debriefResults)
        .where(eq(debriefResults.sessionId, session.sessionId))
        .all()[0]?.total ?? 0;

    const pendingDimensionCount = Math.max(0, activeDimCount - completedCount);

    const posterUrl = movieRow.posterOverridePath
      ? movieRow.posterOverridePath
      : movieRow.posterPath
        ? `/media/images/movie/${movieRow.tmdbId}/poster.jpg`
        : null;

    results.push({
      sessionId: session.sessionId,
      movieId: movieRow.id,
      title: movieRow.title,
      posterUrl,
      status: session.status as 'pending' | 'active',
      createdAt: session.createdAt,
      pendingDimensionCount,
    });
  }

  return results;
}

// ── Debrief Dismiss ──

/**
 * Dismiss a debrief dimension — inserts a debrief_result with comparison_id=null
 * (marks the dimension as skipped). Auto-completes the session when all active
 * dimensions have results.
 */
export function dismissDebriefDimension(sessionId: number, dimensionId: number): void {
  const db = getDrizzle();

  // Verify session exists and is not complete
  const session = db.select().from(debriefSessions).where(eq(debriefSessions.id, sessionId)).get();

  if (!session) {
    throw new NotFoundError('Debrief session', String(sessionId));
  }
  if (session.status === 'complete') {
    throw new ValidationError(`Debrief session ${sessionId} is already complete`);
  }

  // Verify dimension exists
  getDimension(dimensionId);

  // Check for duplicate dismiss
  const existing = db
    .select()
    .from(debriefResults)
    .where(
      and(eq(debriefResults.sessionId, sessionId), eq(debriefResults.dimensionId, dimensionId))
    )
    .get();

  if (existing) {
    throw new ConflictError(
      `Dimension ${dimensionId} already has a result for session ${sessionId}`
    );
  }

  // Insert debrief_result with null comparison_id (dismissed)
  db.insert(debriefResults).values({ sessionId, dimensionId, comparisonId: null }).run();

  // Mark debrief_status row as dismissed
  const watchEntry = db
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, session.watchHistoryId))
    .get();
  if (watchEntry) {
    db.update(debriefStatus)
      .set({ dismissed: 1 })
      .where(
        and(
          eq(debriefStatus.mediaType, watchEntry.mediaType),
          eq(debriefStatus.mediaId, watchEntry.mediaId),
          eq(debriefStatus.dimensionId, dimensionId)
        )
      )
      .run();
  }

  // Check if all active dimensions now have results → auto-complete
  const activeDims = db
    .select({ id: comparisonDimensions.id })
    .from(comparisonDimensions)
    .where(eq(comparisonDimensions.active, 1))
    .all();

  const resultCount = db
    .select({ cnt: count() })
    .from(debriefResults)
    .where(eq(debriefResults.sessionId, sessionId))
    .get();

  if (resultCount && resultCount.cnt >= activeDims.length) {
    db.update(debriefSessions)
      .set({ status: 'complete' })
      .where(eq(debriefSessions.id, sessionId))
      .run();
  }
}

// ── Debrief Comparison ──

/**
 * Record a debrief comparison for a session + dimension.
 * If winnerId > 0, records a real comparison via the provided recordFn and links it.
 * If winnerId = 0, creates a debrief_result with null comparison_id (skip).
 * Auto-completes the session when all active dimensions have results.
 */
export function recordDebriefComparison(
  input: RecordDebriefComparisonInput,
  recordFn: (input: RecordComparisonInput) => ComparisonRow
): {
  comparisonId: number | null;
  sessionComplete: boolean;
} {
  const drizzleDb = getDrizzle();
  const rawDb = getDb();

  // Validate session exists and is not complete
  const session = drizzleDb
    .select()
    .from(debriefSessions)
    .where(eq(debriefSessions.id, input.sessionId))
    .get();
  if (!session) throw new NotFoundError('Debrief session', String(input.sessionId));
  if (session.status === 'complete') {
    throw new ValidationError('Debrief session is already complete');
  }

  // Get the debrief movie from watch_history
  const watchEntry = drizzleDb
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, session.watchHistoryId))
    .get();
  if (!watchEntry) throw new NotFoundError('Watch history entry', String(session.watchHistoryId));

  // Check dimension hasn't already been recorded for this session
  const existingResult = drizzleDb
    .select()
    .from(debriefResults)
    .where(
      and(
        eq(debriefResults.sessionId, input.sessionId),
        eq(debriefResults.dimensionId, input.dimensionId)
      )
    )
    .get();
  if (existingResult) {
    throw new ConflictError('Dimension already recorded for this session');
  }

  return rawDb.transaction(() => {
    let comparisonId: number | null = null;

    if (input.winnerId > 0) {
      // Record a real comparison
      const compRow = recordFn({
        dimensionId: input.dimensionId,
        mediaAType: watchEntry.mediaType as 'movie' | 'tv_show',
        mediaAId: watchEntry.mediaId,
        mediaBType: input.opponentType,
        mediaBId: input.opponentId,
        winnerType:
          input.winnerId === watchEntry.mediaId
            ? (watchEntry.mediaType as 'movie' | 'tv_show')
            : input.opponentType,
        winnerId: input.winnerId,
        drawTier: input.drawTier ?? null,
        source: 'arena',
      });
      comparisonId = compRow.id;
    }

    // Create debrief_result
    drizzleDb
      .insert(debriefResults)
      .values({
        sessionId: input.sessionId,
        dimensionId: input.dimensionId,
        comparisonId,
      })
      .run();

    // Mark debrief_status row as debriefed
    drizzleDb
      .update(debriefStatus)
      .set({ debriefed: 1 })
      .where(
        and(
          eq(debriefStatus.mediaType, watchEntry.mediaType),
          eq(debriefStatus.mediaId, watchEntry.mediaId),
          eq(debriefStatus.dimensionId, input.dimensionId)
        )
      )
      .run();

    // Activate session if still pending
    if (session.status === 'pending') {
      drizzleDb
        .update(debriefSessions)
        .set({ status: 'active' })
        .where(eq(debriefSessions.id, input.sessionId))
        .run();
    }

    // Check if session is complete (all active dimensions have results)
    const activeDimCount = drizzleDb
      .select({ cnt: count() })
      .from(comparisonDimensions)
      .where(eq(comparisonDimensions.active, 1))
      .get();

    const resultCount = drizzleDb
      .select({ cnt: count() })
      .from(debriefResults)
      .where(eq(debriefResults.sessionId, input.sessionId))
      .get();

    const sessionComplete =
      activeDimCount !== undefined &&
      resultCount !== undefined &&
      resultCount.cnt >= activeDimCount.cnt;

    if (sessionComplete) {
      drizzleDb
        .update(debriefSessions)
        .set({ status: 'complete' })
        .where(eq(debriefSessions.id, input.sessionId))
        .run();
    }

    return { comparisonId, sessionComplete };
  })();
}
