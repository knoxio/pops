import { and, desc, eq } from 'drizzle-orm';

import { comparisons, mediaWatchlist, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { getDimension } from '../dimensions.service.js';
import { fetchMovieRow, toRandomPairMovie } from './movie-helpers.js';

import type { RandomPair } from '../types.js';

function getEligibleWatchedMovieIds(): number[] {
  const db = getDrizzle();
  const allWatchedIds = db
    .select({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(and(eq(watchHistory.mediaType, 'movie'), eq(watchHistory.completed, 1)))
    .groupBy(watchHistory.mediaId)
    .all()
    .map((r) => r.mediaId);

  const watchlistedIds = new Set(
    db
      .select({ mediaId: mediaWatchlist.mediaId })
      .from(mediaWatchlist)
      .where(eq(mediaWatchlist.mediaType, 'movie'))
      .all()
      .map((r) => r.mediaId)
  );

  return allWatchedIds.filter((id) => !watchlistedIds.has(id));
}

function getRecentPairs(dimensionId: number, avoidRecent: number): Set<string> {
  const recentPairs = new Set<string>();
  if (avoidRecent <= 0) return recentPairs;
  const db = getDrizzle();
  const recent = db
    .select({
      mediaAId: comparisons.mediaAId,
      mediaBId: comparisons.mediaBId,
    })
    .from(comparisons)
    .where(
      and(
        eq(comparisons.dimensionId, dimensionId),
        eq(comparisons.mediaAType, 'movie'),
        eq(comparisons.mediaBType, 'movie')
      )
    )
    .orderBy(desc(comparisons.comparedAt))
    .limit(avoidRecent)
    .all();
  for (const r of recent) {
    recentPairs.add(`${r.mediaAId}-${r.mediaBId}`);
    recentPairs.add(`${r.mediaBId}-${r.mediaAId}`);
  }
  return recentPairs;
}

function pickRandomPairIndices(length: number): [number, number] {
  const idxA = Math.floor(Math.random() * length);
  let idxB = Math.floor(Math.random() * (length - 1));
  if (idxB >= idxA) idxB++;
  return [idxA, idxB];
}

function pickPairIds(
  watchedIds: number[],
  recentPairs: Set<string>
): [number | null, number | null] {
  const maxAttempts = Math.min(watchedIds.length * 3, 100);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const [idxA, idxB] = pickRandomPairIndices(watchedIds.length);
    const candidateA = watchedIds[idxA];
    const candidateB = watchedIds[idxB];
    if (candidateA !== undefined && candidateB !== undefined) {
      if (!recentPairs.has(`${candidateA}-${candidateB}`)) {
        return [candidateA, candidateB];
      }
    }
  }
  // Fallback: pick any pair, recent or not
  const [idxA, idxB] = pickRandomPairIndices(watchedIds.length);
  return [watchedIds[idxA] ?? null, watchedIds[idxB] ?? null];
}

/**
 * Get a random pair of watched movies for comparison, avoiding recently
 * compared pairs for the given dimension.
 */
export function getRandomPair(dimensionId: number, avoidRecent: number = 50): RandomPair | null {
  getDimension(dimensionId);
  const watchedMovieIds = getEligibleWatchedMovieIds();
  if (watchedMovieIds.length < 2) return null;

  const recentPairs = getRecentPairs(dimensionId, avoidRecent);
  const [movieAId, movieBId] = pickPairIds(watchedMovieIds, recentPairs);
  if (movieAId === null || movieBId === null) return null;

  const movieARow = fetchMovieRow(movieAId);
  const movieBRow = fetchMovieRow(movieBId);
  if (!movieARow || !movieBRow) return null;

  return {
    movieA: toRandomPairMovie(movieARow),
    movieB: toRandomPairMovie(movieBRow),
  };
}
