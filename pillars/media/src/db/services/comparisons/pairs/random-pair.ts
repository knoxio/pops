/**
 * Random-pair fallback — pick two watched movies, avoiding recently-compared
 * pairs. HTTP-free, `(db, …)` arg.
 */
import { and, desc, eq } from 'drizzle-orm';

import { comparisons, mediaWatchlist, watchHistory } from '../../../schema.js';
import { getDimension } from '../dimensions.js';
import { fetchMovieRow, toRandomPairMovie } from './movie-helpers.js';

import type { MediaDb } from '../../internal.js';
import type { RandomPair } from '../mappers.js';

function getEligibleWatchedMovieIds(db: MediaDb): number[] {
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

function getRecentPairs(db: MediaDb, dimensionId: number, avoidRecent: number): Set<string> {
  const recentPairs = new Set<string>();
  if (avoidRecent <= 0) return recentPairs;
  const recent = db
    .select({ mediaAId: comparisons.mediaAId, mediaBId: comparisons.mediaBId })
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
      if (!recentPairs.has(`${candidateA}-${candidateB}`)) return [candidateA, candidateB];
    }
  }
  const [idxA, idxB] = pickRandomPairIndices(watchedIds.length);
  return [watchedIds[idxA] ?? null, watchedIds[idxB] ?? null];
}

/** A random pair of watched movies, avoiding recently-compared pairs. */
export function getRandomPair(
  db: MediaDb,
  dimensionId: number,
  avoidRecent: number = 50
): RandomPair | null {
  getDimension(db, dimensionId);
  const watchedMovieIds = getEligibleWatchedMovieIds(db);
  if (watchedMovieIds.length < 2) return null;

  const recentPairs = getRecentPairs(db, dimensionId, avoidRecent);
  const [movieAId, movieBId] = pickPairIds(watchedMovieIds, recentPairs);
  if (movieAId === null || movieBId === null) return null;

  const movieARow = fetchMovieRow(db, movieAId);
  const movieBRow = fetchMovieRow(db, movieBId);
  if (!movieARow || !movieBRow) return null;

  return { movieA: toRandomPairMovie(movieARow), movieB: toRandomPairMovie(movieBRow) };
}
