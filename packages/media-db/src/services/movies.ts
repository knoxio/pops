/**
 * Movies CRUD against the media pillar's SQLite via drizzle.
 *
 * Services take a `MediaDb` handle as their first argument; the calling
 * layer (pops-api modules) is responsible for resolving the singleton
 * or transaction handle to pass in. Mirrors `@pops/finance-db`'s
 * service signature pattern.
 *
 * The in-tree service in `apps/pops-api/src/modules/media/movies/`
 * still routes through the shared `getDrizzle()` handle for now —
 * PRD-165 PR 3 flips that to `getMediaDrizzle()` and routes through
 * this module.
 */
import { and, count, desc, eq, like, type SQL, sql } from 'drizzle-orm';

import { MovieConflictError, MovieNotFoundError } from '../errors.js';
import { movies } from '../schema.js';
import { isMoviesTmdbIdUniqueViolation } from './movies-unique-violation.js';

import type { MediaDb } from './internal.js';

/** Raw drizzle row shape — the persisted movies record. */
export type MovieRow = typeof movies.$inferSelect;

/**
 * Public alias for the persisted movie row. The UI-side view-model
 * (poster/backdrop URL derivation, JSON-parsed genres) is constructed in
 * pops-api's `toMovie` helper at the router boundary so this package
 * stays HTTP-free.
 */
export type Movie = MovieRow;

/** Filters accepted by {@link listMovies}. */
export interface MovieFilters {
  search?: string | undefined;
  genre?: string | undefined;
}

/** Count + rows for a paginated list. */
export interface MovieListResult {
  rows: MovieRow[];
  total: number;
}

/** Mutable subset accepted on create. `genres` defaults to `[]`. */
export interface CreateMovieInput {
  tmdbId: number;
  imdbId?: string | null;
  title: string;
  originalTitle?: string | null;
  overview?: string | null;
  tagline?: string | null;
  releaseDate?: string | null;
  runtime?: number | null;
  status?: string | null;
  originalLanguage?: string | null;
  budget?: number | null;
  revenue?: number | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  logoPath?: string | null;
  posterOverridePath?: string | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  genres?: string[];
}

/** Same shape as create — all fields optional for PATCH semantics. */
export interface UpdateMovieInput {
  tmdbId?: number;
  imdbId?: string | null;
  title?: string;
  originalTitle?: string | null;
  overview?: string | null;
  tagline?: string | null;
  releaseDate?: string | null;
  runtime?: number | null;
  status?: string | null;
  originalLanguage?: string | null;
  budget?: number | null;
  revenue?: number | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  logoPath?: string | null;
  posterOverridePath?: string | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  genres?: string[];
}

const MOVIE_NULLABLE_INSERT_KEYS = [
  'imdbId',
  'originalTitle',
  'overview',
  'tagline',
  'releaseDate',
  'runtime',
  'status',
  'originalLanguage',
  'budget',
  'revenue',
  'posterPath',
  'backdropPath',
  'logoPath',
  'posterOverridePath',
  'voteAverage',
  'voteCount',
] as const satisfies ReadonlyArray<keyof CreateMovieInput & keyof typeof movies.$inferInsert>;

function buildMovieInsertValues(input: CreateMovieInput): typeof movies.$inferInsert {
  const values: Record<string, unknown> = {
    tmdbId: input.tmdbId,
    title: input.title,
    genres: JSON.stringify(input.genres ?? []),
  };
  for (const key of MOVIE_NULLABLE_INSERT_KEYS) {
    values[key] = input[key] ?? null;
  }
  return values as typeof movies.$inferInsert;
}

const MOVIE_REQUIRED_UPDATE_KEYS = ['tmdbId', 'title'] as const satisfies ReadonlyArray<
  keyof UpdateMovieInput & keyof typeof movies.$inferSelect
>;

const MOVIE_NULLABLE_UPDATE_KEYS = [
  'imdbId',
  'originalTitle',
  'overview',
  'tagline',
  'releaseDate',
  'runtime',
  'status',
  'originalLanguage',
  'budget',
  'revenue',
  'posterPath',
  'backdropPath',
  'logoPath',
  'posterOverridePath',
  'voteAverage',
  'voteCount',
] as const satisfies ReadonlyArray<keyof UpdateMovieInput & keyof typeof movies.$inferSelect>;

function buildMovieUpdate(input: UpdateMovieInput): Partial<typeof movies.$inferSelect> | null {
  const updates: Record<string, unknown> = {};
  let touched = false;

  for (const key of MOVIE_REQUIRED_UPDATE_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    updates[key] = value;
    touched = true;
  }

  for (const key of MOVIE_NULLABLE_UPDATE_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    updates[key] = value ?? null;
    touched = true;
  }

  if (input.genres !== undefined) {
    updates.genres = JSON.stringify(input.genres);
    touched = true;
  }

  if (!touched) return null;
  updates.updatedAt = new Date().toISOString();
  return updates as Partial<typeof movies.$inferSelect>;
}

/** List movies with optional filters. Ordered by `release_date DESC`. */
export function listMovies(
  db: MediaDb,
  filters: MovieFilters,
  limit: number,
  offset: number
): MovieListResult {
  const conditions: SQL[] = [];

  if (filters.search) {
    conditions.push(like(movies.title, `%${filters.search}%`));
  }
  if (filters.genre) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(${movies.genres}) WHERE json_each.value = ${filters.genre})`
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(movies)
    .where(where)
    .orderBy(desc(movies.releaseDate))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db.select({ total: count() }).from(movies).where(where).get();

  return { rows, total: countRow?.total ?? 0 };
}

/** Get a single movie by id. Throws `MovieNotFoundError` if missing. */
export function getMovie(db: MediaDb, id: number): MovieRow {
  const row = db.select().from(movies).where(eq(movies.id, id)).get();
  if (!row) throw new MovieNotFoundError(id);
  return row;
}

/** Get a single movie by TMDB id. Returns `null` if not found. */
export function getMovieByTmdbId(db: MediaDb, tmdbId: number): MovieRow | null {
  return db.select().from(movies).where(eq(movies.tmdbId, tmdbId)).get() ?? null;
}

/**
 * Create a new movie. Returns the persisted row. Throws
 * `MovieConflictError` when the `tmdbId` already exists (the unique index
 * raises `SQLITE_CONSTRAINT_UNIQUE` on `movies.tmdb_id`). Any other
 * constraint violation propagates untouched so the caller can map it.
 */
export function createMovie(db: MediaDb, input: CreateMovieInput): MovieRow {
  try {
    const result = db.insert(movies).values(buildMovieInsertValues(input)).run();
    return getMovie(db, Number(result.lastInsertRowid));
  } catch (err) {
    if (isMoviesTmdbIdUniqueViolation(err)) {
      throw new MovieConflictError(input.tmdbId);
    }
    throw err;
  }
}

/**
 * Patch a movie. Throws `MovieNotFoundError` if missing. No-op writes
 * (empty `input`) still re-read the row but skip the UPDATE.
 */
export function updateMovie(db: MediaDb, id: number, input: UpdateMovieInput): MovieRow {
  getMovie(db, id);
  const updates = buildMovieUpdate(input);
  if (updates) {
    db.update(movies).set(updates).where(eq(movies.id, id)).run();
  }
  return getMovie(db, id);
}

/** Delete a movie. Throws `MovieNotFoundError` if missing. */
export function deleteMovie(db: MediaDb, id: number): void {
  getMovie(db, id);
  const result = db.delete(movies).where(eq(movies.id, id)).run();
  if (result.changes === 0) throw new MovieNotFoundError(id);
}
