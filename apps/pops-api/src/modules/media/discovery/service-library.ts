import { and, eq, notInArray, sql } from 'drizzle-orm';

import { mediaWatchlist, movies, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { TMDB_GENRE_MAP } from './types.js';

import type { DiscoverResult, QuickPickMovie } from './types.js';

/** Reverse map: genre name → TMDB genre ID. */
const GENRE_NAME_TO_ID = Object.fromEntries(
  Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)])
);

/**
 * Get random unwatched movies from the library for quick pick.
 * Excludes movies already on the watchlist or already watched.
 */
export function getQuickPickMovies(count_: number): QuickPickMovie[] {
  const db = getDrizzle();

  const watchedIds = db
    .selectDistinct({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(eq(watchHistory.mediaType, 'movie'));

  const watchlistIds = db
    .select({ mediaId: mediaWatchlist.mediaId })
    .from(mediaWatchlist)
    .where(eq(mediaWatchlist.mediaType, 'movie'));

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
      genres: movies.genres,
      runtime: movies.runtime,
    })
    .from(movies)
    .where(and(notInArray(movies.id, watchedIds), notInArray(movies.id, watchlistIds)))
    .orderBy(sql`RANDOM()`)
    .limit(count_)
    .all();

  return rows.map((row) => ({
    ...row,
    genres: row.genres ?? '[]',
    posterUrl: row.posterPath ? `/media/images/movie/${row.tmdbId}/poster.jpg` : null,
  }));
}

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
 * Get unwatched library movies mapped to DiscoverResult[] for scoring.
 * Local-only — no external API calls.
 */
export function getUnwatchedLibraryMovies(): DiscoverResult[] {
  const db = getDrizzle();
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
