import { movies } from '@pops/db-types';

import type { DiscoverResult } from '../types.js';

/** Build a poster URL for a library movie. */
export function posterUrl(tmdbId: number, posterPath: string | null): string | null {
  if (!posterPath) return null;
  return `/media/images/movie/${tmdbId}/poster.jpg`;
}

export interface RawMovieRow {
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

/** Map a raw movie row to a DiscoverResult. */
export function toResult(row: RawMovieRow): DiscoverResult {
  let genreIds: number[] = [];
  try {
    genreIds = JSON.parse(row.genres ?? '[]') as number[];
  } catch {
    genreIds = [];
  }
  return {
    tmdbId: row.tmdbId,
    title: row.title,
    overview: row.overview ?? '',
    releaseDate: row.releaseDate ?? '',
    posterPath: row.posterPath,
    posterUrl: posterUrl(row.tmdbId, row.posterPath),
    backdropPath: row.backdropPath,
    voteAverage: row.voteAverage ?? 0,
    voteCount: row.voteCount ?? 0,
    genreIds,
    popularity: 0,
    inLibrary: true,
    isWatched: false,
    onWatchlist: false,
  };
}

/** Common movie columns for select. */
export const movieCols = {
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
