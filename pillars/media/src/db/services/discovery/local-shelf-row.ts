/**
 * Shared row shape + mapper for the local-library shelf queries.
 *
 * The local shelves all `SELECT` the same movie columns and map them to a
 * {@link DiscoverResult} with a local poster proxy. Centralised here so every
 * local query maps rows identically. The `genres` column stores a JSON array;
 * the monolith parsed it as numeric ids here (local shelves don't re-score),
 * so the parse is best-effort and tolerant of the name-array form.
 */
import { movies } from '../../schema.js';

import type { DiscoverResult } from './types.js';

export interface LocalMovieRow {
  id: number;
  tmdbId: number;
  title: string;
  overview: string | null;
  releaseDate: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  genres: string | null;
}

/** The common movie column projection for local-shelf selects. */
export const localMovieCols = {
  id: movies.id,
  tmdbId: movies.tmdbId,
  title: movies.title,
  overview: movies.overview,
  releaseDate: movies.releaseDate,
  posterPath: movies.posterPath,
  backdropPath: movies.backdropPath,
  voteAverage: movies.voteAverage,
  voteCount: movies.voteCount,
  genres: movies.genres,
};

function parseGenreIds(genres: string | null): number[] {
  try {
    return JSON.parse(genres ?? '[]') as number[];
  } catch {
    return [];
  }
}

/** Map a local movie row to a {@link DiscoverResult} (in-library, proxied poster). */
export function toLocalResult(row: LocalMovieRow): DiscoverResult {
  return {
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
  };
}
