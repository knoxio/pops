import { and, asc, eq } from 'drizzle-orm';

import { comparisons, mediaScores, movies, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { getDimension } from '../dimensions.service.js';
import { resolveMoviePoster } from '../pairs/movie-helpers.js';

import type { DebriefOpponent } from '../types.js';

interface ScoreRow {
  mediaId: number;
  score: number;
}

function fetchAllScores(mediaType: string, dimensionId: number): ScoreRow[] {
  const db = getDrizzle();
  return db
    .select({ mediaId: mediaScores.mediaId, score: mediaScores.score })
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
}

function fetchBlacklistedIds(mediaType: string): Set<number> {
  const db = getDrizzle();
  const rows = db
    .select({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, mediaType as 'movie' | 'episode'),
        eq(watchHistory.blacklisted, 1)
      )
    )
    .all();
  return new Set(rows.map((r) => r.mediaId));
}

function fetchComparedAgainstIds(
  mediaType: string,
  mediaId: number,
  dimensionId: number
): Set<number> {
  const db = getDrizzle();
  const ids = new Set<number>();
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
  for (const c of compsA) ids.add(c.mediaBId);

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
  for (const c of compsB) ids.add(c.mediaAId);
  return ids;
}

function pickClosestToMedian(eligible: ScoreRow[]): ScoreRow | null {
  if (eligible.length === 0) return null;
  const medianIndex = Math.floor(eligible.length / 2);
  const medianEntry = eligible[medianIndex];
  if (!medianEntry) return null;
  const medianScore = medianEntry.score;
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
  return closest;
}

function buildOpponent(closest: ScoreRow): DebriefOpponent | null {
  const db = getDrizzle();
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
  return {
    id: movieRow.id,
    title: movieRow.title,
    posterPath: movieRow.posterPath,
    posterUrl: resolveMoviePoster(movieRow),
  };
}

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
  getDimension(dimensionId);
  const allScores = fetchAllScores(mediaType, dimensionId);
  const blacklistedIds = fetchBlacklistedIds(mediaType);
  const comparedAgainstIds = fetchComparedAgainstIds(mediaType, mediaId, dimensionId);
  const eligible = allScores.filter(
    (s) =>
      s.mediaId !== mediaId && !blacklistedIds.has(s.mediaId) && !comparedAgainstIds.has(s.mediaId)
  );
  const closest = pickClosestToMedian(eligible);
  if (!closest) return null;
  return buildOpponent(closest);
}
