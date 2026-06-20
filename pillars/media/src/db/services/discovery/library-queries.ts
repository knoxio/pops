/**
 * Local-library discover queries — unwatched movies mapped to
 * {@link DiscoverResult} for profile scoring (the `fromYourServer` /
 * `from-your-server` shelf).
 *
 * HTTP-free, `(db, …)` arg. The genre column stores genre *names* as a JSON
 * array; they are mapped back to TMDB genre ids so the scorer can match them.
 * Ported from the monolith `discovery/service-library.ts`.
 */
import { eq, notInArray } from 'drizzle-orm';

import { movies, watchHistory } from '../../schema.js';
import { TMDB_GENRE_MAP } from './types.js';

import type { MediaDb } from '../internal.js';
import type { DiscoverResult } from './types.js';

/** Reverse map: genre name → TMDB genre id. */
const GENRE_NAME_TO_ID = Object.fromEntries(
  Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)])
);

function parseGenreIds(genresJson: string | null): number[] {
  let genreNames: string[] = [];
  try {
    genreNames = genresJson ? (JSON.parse(genresJson) as string[]) : [];
  } catch {
    return [];
  }
  return genreNames.map((name) => GENRE_NAME_TO_ID[name]).filter((id): id is number => id != null);
}

/**
 * Unwatched library movies mapped to {@link DiscoverResult}[] for scoring.
 * Local-only — no external API calls. Poster urls resolve to the local proxy.
 */
export function getUnwatchedLibraryMovies(db: MediaDb): DiscoverResult[] {
  const watchedIds = db
    .selectDistinct({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(eq(watchHistory.mediaType, 'movie'));

  const rows = db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      releaseDate: movies.releaseDate,
      posterPath: movies.posterPath,
      backdropPath: movies.backdropPath,
      overview: movies.overview,
      voteAverage: movies.voteAverage,
      voteCount: movies.voteCount,
      genres: movies.genres,
    })
    .from(movies)
    .where(notInArray(movies.id, watchedIds))
    .all();

  return rows.map((row) => ({
    tmdbId: row.tmdbId,
    title: row.title,
    overview: row.overview ?? '',
    releaseDate: row.releaseDate ?? '',
    posterPath: row.posterPath,
    posterUrl: row.posterPath ? `/media/images/movie/${row.tmdbId}/poster.jpg` : null,
    backdropPath: row.backdropPath,
    voteAverage: row.voteAverage ?? 0,
    voteCount: row.voteCount ?? 0,
    genreIds: parseGenreIds(row.genres),
    popularity: 0,
    inLibrary: true,
    isWatched: false,
    onWatchlist: false,
  }));
}
