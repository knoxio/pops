/**
 * Movie metadata helpers for pair generation. HTTP-free, `(db, …)` arg.
 */
import { eq } from 'drizzle-orm';

import { movies } from '../../../schema.js';

import type { MediaDb } from '../../internal.js';
import type { RandomPairMovie } from '../mappers.js';

export interface MovieRow {
  id: number;
  title: string;
  posterPath: string | null;
  tmdbId: number;
  posterOverridePath: string | null;
}

/** Resolve a movie's poster URL using overrides and a tmdb fallback. */
export function resolveMoviePoster(row: {
  posterPath: string | null;
  tmdbId: number;
  posterOverridePath: string | null;
}): string | null {
  if (row.posterOverridePath) return row.posterOverridePath;
  if (row.posterPath) return `/media/images/movie/${row.tmdbId}/poster.jpg`;
  return null;
}

/** Fetch movie metadata for a single id. */
export function fetchMovieRow(db: MediaDb, movieId: number): MovieRow | undefined {
  return db
    .select({
      id: movies.id,
      title: movies.title,
      posterPath: movies.posterPath,
      tmdbId: movies.tmdbId,
      posterOverridePath: movies.posterOverridePath,
    })
    .from(movies)
    .where(eq(movies.id, movieId))
    .get();
}

/** Convert a movie row into a {@link RandomPairMovie}. */
export function toRandomPairMovie(row: MovieRow): RandomPairMovie {
  return {
    id: row.id,
    title: row.title,
    posterPath: row.posterPath,
    posterUrl: resolveMoviePoster(row),
  };
}
