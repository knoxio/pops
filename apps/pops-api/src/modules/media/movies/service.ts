/**
 * Movie service — CRUD operations against SQLite via Drizzle ORM.
 */
import { count, desc, eq, like, and, sql, type SQL } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { movies } from "@pops/db-types";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import type { MovieRow, CreateMovieInput, UpdateMovieInput, MovieFilters } from "./types.js";

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

  return { rows, total: countRow.total };
}

/** Get a single movie by id. Throws NotFoundError if missing. */
export function getMovie(id: number): MovieRow {
  const db = getDrizzle();
  const row = db.select().from(movies).where(eq(movies.id, id)).get();

  if (!row) throw new NotFoundError("Movie", String(id));
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
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      throw new ConflictError(`Movie with tmdbId ${input.tmdbId} already exists`);
    }
    throw err;
  }
}

/** Update an existing movie. Returns the updated row. */
export function updateMovie(id: number, input: UpdateMovieInput): MovieRow {
  // Verify it exists first
  getMovie(id);

  const updates: Partial<typeof movies.$inferSelect> = {};

  if (input.tmdbId !== undefined) updates.tmdbId = input.tmdbId;
  if (input.imdbId !== undefined) updates.imdbId = input.imdbId ?? null;
  if (input.title !== undefined) updates.title = input.title;
  if (input.originalTitle !== undefined) updates.originalTitle = input.originalTitle ?? null;
  if (input.overview !== undefined) updates.overview = input.overview ?? null;
  if (input.tagline !== undefined) updates.tagline = input.tagline ?? null;
  if (input.releaseDate !== undefined) updates.releaseDate = input.releaseDate ?? null;
  if (input.runtime !== undefined) updates.runtime = input.runtime ?? null;
  if (input.status !== undefined) updates.status = input.status ?? null;
  if (input.originalLanguage !== undefined)
    updates.originalLanguage = input.originalLanguage ?? null;
  if (input.budget !== undefined) updates.budget = input.budget ?? null;
  if (input.revenue !== undefined) updates.revenue = input.revenue ?? null;
  if (input.posterPath !== undefined) updates.posterPath = input.posterPath ?? null;
  if (input.backdropPath !== undefined) updates.backdropPath = input.backdropPath ?? null;
  if (input.logoPath !== undefined) updates.logoPath = input.logoPath ?? null;
  if (input.posterOverridePath !== undefined)
    updates.posterOverridePath = input.posterOverridePath ?? null;
  if (input.voteAverage !== undefined) updates.voteAverage = input.voteAverage ?? null;
  if (input.voteCount !== undefined) updates.voteCount = input.voteCount ?? null;
  if (input.genres !== undefined) updates.genres = JSON.stringify(input.genres);

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date().toISOString();
    getDrizzle().update(movies).set(updates).where(eq(movies.id, id)).run();
  }

  return getMovie(id);
}

/** Delete a movie by ID. Throws NotFoundError if missing. */
export function deleteMovie(id: number): void {
  // Verify it exists first
  getMovie(id);

  const result = getDrizzle().delete(movies).where(eq(movies.id, id)).run();
  if (result.changes === 0) throw new NotFoundError("Movie", String(id));
}
