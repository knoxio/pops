/**
 * Movies wrapper — resolves the media-pillar drizzle handle and forwards to
 * `@pops/media-db`'s `moviesService` (PRD-165 PR 3 cutover).
 *
 * Mirrors the shelf-impressions PR 3 pattern: in-tree callers (router.ts,
 * library/service.ts, plex sync, watchlist push, uri-handler, …) keep
 * importing from this file unchanged. The handle now points at the media
 * pillar's per-pillar SQLite via `getMediaDrizzle()` instead of the shared
 * `pops.db` singleton, so every write lands in `media.db.movies`. Reads
 * issued from the legacy mount still serve the same rows because the
 * backfill keeps both stores in sync until PR 4 retires the shim.
 *
 * Error translation: the package surface throws `MovieNotFoundError` /
 * `MovieConflictError`. We re-throw them as the in-tree `NotFoundError` /
 * `ConflictError` so the router's `instanceof` checks (and library/plex
 * callers that catch the same shapes) keep working without churn.
 */
import {
  moviesService,
  MovieConflictError,
  MovieNotFoundError,
  type MovieListResult,
} from '@pops/media-db';

import { getMediaDrizzle } from '../../../db/media-db-handle.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type { CreateMovieInput, MovieFilters, MovieRow, UpdateMovieInput } from './types.js';

export type { MovieListResult };

function translate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof MovieNotFoundError) {
      throw new NotFoundError('Movie', String(err.id));
    }
    if (err instanceof MovieConflictError) {
      throw new ConflictError(`Movie with tmdbId ${err.tmdbId} already exists`);
    }
    throw err;
  }
}

/** List movies with optional filters. */
export function listMovies(filters: MovieFilters, limit: number, offset: number): MovieListResult {
  return moviesService.listMovies(getMediaDrizzle(), filters, limit, offset);
}

/** Get a single movie by id. Throws `NotFoundError` if missing. */
export function getMovie(id: number): MovieRow {
  return translate(() => moviesService.getMovie(getMediaDrizzle(), id));
}

/** Get a single movie by TMDB ID. Returns null if not found. */
export function getMovieByTmdbId(tmdbId: number): MovieRow | null {
  return moviesService.getMovieByTmdbId(getMediaDrizzle(), tmdbId);
}

/** Create a new movie. Throws `ConflictError` on duplicate tmdbId. */
export function createMovie(input: CreateMovieInput): MovieRow {
  return translate(() => moviesService.createMovie(getMediaDrizzle(), input));
}

/** Update an existing movie. Throws `NotFoundError` if missing. */
export function updateMovie(id: number, input: UpdateMovieInput): MovieRow {
  return translate(() => moviesService.updateMovie(getMediaDrizzle(), id, input));
}

/** Delete a movie by ID. Throws `NotFoundError` if missing. */
export function deleteMovie(id: number): void {
  translate(() => moviesService.deleteMovie(getMediaDrizzle(), id));
}
