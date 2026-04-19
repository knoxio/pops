import { and, count, desc, eq, like, type SQL, sql } from 'drizzle-orm';

/**
 * Movie service — CRUD operations against SQLite via Drizzle ORM.
 */
import { movies } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type { CreateMovieInput, MovieFilters, MovieRow, UpdateMovieInput } from './types.js';

/** Count + rows for a paginated list. */
export interface MovieListResult {
  rows: MovieRow[];
  total: number;
}

/** List movies with optional filters. */
export function listMovies(filters: MovieFilters, limit: number, offset: number): MovieListResult {
  const db = getDrizzle();
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

  const [countRow] = db.select({ total: count() }).from(movies).where(where).all();

  return { rows, total: countRow?.total ?? 0 };
}

/** Get a single movie by id. Throws NotFoundError if missing. */
export function getMovie(id: number): MovieRow {
  const db = getDrizzle();
  const row = db.select().from(movies).where(eq(movies.id, id)).get();

  if (!row) throw new NotFoundError('Movie', String(id));
  return row;
}

/** Get a single movie by TMDB ID. Returns null if not found. */
export function getMovieByTmdbId(tmdbId: number): MovieRow | null {
  const db = getDrizzle();
  return db.select().from(movies).where(eq(movies.tmdbId, tmdbId)).get() ?? null;
}

/** Create a new movie. Returns the created row. Throws ConflictError on duplicate tmdbId. */
export function createMovie(input: CreateMovieInput): MovieRow {
  const db = getDrizzle();

  try {
    const result = db
      .insert(movies)
      .values({
        tmdbId: input.tmdbId,
        imdbId: input.imdbId ?? null,
        title: input.title,
        originalTitle: input.originalTitle ?? null,
        overview: input.overview ?? null,
        tagline: input.tagline ?? null,
        releaseDate: input.releaseDate ?? null,
        runtime: input.runtime ?? null,
        status: input.status ?? null,
        originalLanguage: input.originalLanguage ?? null,
        budget: input.budget ?? null,
        revenue: input.revenue ?? null,
        posterPath: input.posterPath ?? null,
        backdropPath: input.backdropPath ?? null,
        logoPath: input.logoPath ?? null,
        posterOverridePath: input.posterOverridePath ?? null,
        voteAverage: input.voteAverage ?? null,
        voteCount: input.voteCount ?? null,
        genres: JSON.stringify(input.genres ?? []),
      })
      .run();

    return getMovie(Number(result.lastInsertRowid));
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new ConflictError(`Movie with tmdbId ${input.tmdbId} already exists`);
    }
    throw err;
  }
}

const MOVIE_REQUIRED_KEYS = ['tmdbId', 'title'] as const satisfies ReadonlyArray<
  keyof UpdateMovieInput & keyof typeof movies.$inferSelect
>;

const MOVIE_NULLABLE_KEYS = [
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

  for (const key of MOVIE_REQUIRED_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    updates[key] = value;
    touched = true;
  }

  for (const key of MOVIE_NULLABLE_KEYS) {
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

/** Update an existing movie. Returns the updated row. */
export function updateMovie(id: number, input: UpdateMovieInput): MovieRow {
  getMovie(id);
  const updates = buildMovieUpdate(input);
  if (updates) {
    getDrizzle().update(movies).set(updates).where(eq(movies.id, id)).run();
  }
  return getMovie(id);
}

/** Delete a movie by ID. Throws NotFoundError if missing. */
export function deleteMovie(id: number): void {
  // Verify it exists first
  getMovie(id);

  const result = getDrizzle().delete(movies).where(eq(movies.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Movie', String(id));
}
