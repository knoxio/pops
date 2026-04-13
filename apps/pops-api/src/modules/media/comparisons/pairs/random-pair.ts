import { comparisons, mediaWatchlist, movies, watchHistory } from '@pops/db-types';
import { and, desc, eq } from 'drizzle-orm';

import { getDrizzle } from '../../../../db.js';
import { getDimension } from '../dimensions.service.js';
import type { RandomPair } from '../types.js';

/**
 * Get a random pair of watched movies for comparison, avoiding recently
 * compared pairs for the given dimension.
 *
 * @param dimensionId - The dimension to compare on
 * @param avoidRecent - Number of recent comparisons to check for repeat avoidance (default 10)
 * @returns A pair of movies with metadata, or null if fewer than 2 watched movies exist
 */
export function getRandomPair(dimensionId: number, avoidRecent: number = 50): RandomPair | null {
  getDimension(dimensionId); // verify dimension exists

  const db = getDrizzle();

  // Get distinct watched movie IDs
  const allWatchedIds = db
    .select({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(and(eq(watchHistory.mediaType, 'movie'), eq(watchHistory.completed, 1)))
    .groupBy(watchHistory.mediaId)
    .all()
    .map((r) => r.mediaId);

  // Exclude movies on the watchlist (user queued them for rewatch, skip in arena)
  const watchlistedIds = new Set(
    db
      .select({ mediaId: mediaWatchlist.mediaId })
      .from(mediaWatchlist)
      .where(eq(mediaWatchlist.mediaType, 'movie'))
      .all()
      .map((r) => r.mediaId)
  );

  const watchedMovieIds = allWatchedIds.filter((id) => !watchlistedIds.has(id));

  if (watchedMovieIds.length < 2) return null;

  // Get recent comparison pairs for this dimension to avoid
  const recentPairs: Set<string> = new Set();
  if (avoidRecent > 0) {
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
      // Store both orderings so we can check either direction
      recentPairs.add(`${r.mediaAId}-${r.mediaBId}`);
      recentPairs.add(`${r.mediaBId}-${r.mediaAId}`);
    }
  }

  // Try to find a non-recent pair (with bounded attempts)
  const maxAttempts = Math.min(watchedMovieIds.length * 3, 100);
  let movieAId: number | null = null;
  let movieBId: number | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const idxA = Math.floor(Math.random() * watchedMovieIds.length);
    let idxB = Math.floor(Math.random() * (watchedMovieIds.length - 1));
    if (idxB >= idxA) idxB++;

    const candidateA = watchedMovieIds[idxA];
    const candidateB = watchedMovieIds[idxB];

    if (!recentPairs.has(`${candidateA}-${candidateB}`)) {
      movieAId = candidateA ?? null;
      movieBId = candidateB ?? null;
      break;
    }
  }

  // Fallback: if all pairs are recent, just pick any random pair
  if (movieAId === null || movieBId === null) {
    const idxA = Math.floor(Math.random() * watchedMovieIds.length);
    let idxB = Math.floor(Math.random() * (watchedMovieIds.length - 1));
    if (idxB >= idxA) idxB++;
    movieAId = watchedMovieIds[idxA] ?? null;
    movieBId = watchedMovieIds[idxB] ?? null;
  }

  // Fetch movie metadata
  if (movieAId === null || movieBId === null) return null;

  const movieARow = db
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, movieAId))
    .get();

  const movieBRow = db
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, movieBId))
    .get();

  if (!movieARow || !movieBRow) return null;

  const resolveMoviePoster = (row: {
    posterPath: string | null;
    tmdbId: number;
    posterOverridePath: string | null;
  }): string | null => {
    if (row.posterOverridePath) return row.posterOverridePath;
    if (row.posterPath) return `/media/images/movie/${row.tmdbId}/poster.jpg`;
    return null;
  };

  return {
    movieA: {
      id: movieARow.id,
      title: movieARow.title,
      posterPath: movieARow.posterPath,
      posterUrl: resolveMoviePoster(movieARow),
    },
    movieB: {
      id: movieBRow.id,
      title: movieBRow.title,
      posterPath: movieBRow.posterPath,
      posterUrl: resolveMoviePoster(movieBRow),
    },
  };
}
