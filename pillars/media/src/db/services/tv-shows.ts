/** TV shows CRUD against the media pillar's SQLite via drizzle. */
import { and, asc, count, eq, like, type SQL } from 'drizzle-orm';

import { TvShowConflictError, TvShowNotFoundError } from '../errors.js';
import { tvShows } from '../schema.js';

import type { MediaDb } from './internal.js';

/** Raw drizzle row shape — the persisted tv_shows record. */
export type TvShowRow = typeof tvShows.$inferSelect;

/**
 * Public alias for the persisted TV show row. The UI-side view-model
 * (poster/backdrop URL derivation, JSON-parsed genres + networks) is
 * constructed at the router boundary so this layer stays HTTP-free.
 */
export type TvShow = TvShowRow;

/** Filters accepted by {@link listTvShows}. */
export interface TvShowFilters {
  search?: string | undefined;
  status?: string | undefined;
}

/** Count + rows for a paginated list. */
export interface TvShowListResult {
  rows: TvShowRow[];
  total: number;
}

/** Mutable subset accepted on create. `genres` / `networks` default to `null`. */
export interface CreateTvShowInput {
  tvdbId: number;
  name: string;
  originalName?: string | null;
  overview?: string | null;
  firstAirDate?: string | null;
  lastAirDate?: string | null;
  status?: string | null;
  originalLanguage?: string | null;
  numberOfSeasons?: number | null;
  numberOfEpisodes?: number | null;
  episodeRunTime?: number | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  logoPath?: string | null;
  posterOverridePath?: string | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  genres?: string[];
  networks?: string[];
}

/** Same shape as create — all fields optional for PATCH semantics. */
export interface UpdateTvShowInput {
  tvdbId?: number;
  name?: string;
  originalName?: string | null;
  overview?: string | null;
  firstAirDate?: string | null;
  lastAirDate?: string | null;
  status?: string | null;
  originalLanguage?: string | null;
  numberOfSeasons?: number | null;
  numberOfEpisodes?: number | null;
  episodeRunTime?: number | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  logoPath?: string | null;
  posterOverridePath?: string | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  genres?: string[];
  networks?: string[];
}

const TV_SHOW_NULLABLE_INSERT_KEYS = [
  'originalName',
  'overview',
  'firstAirDate',
  'lastAirDate',
  'status',
  'originalLanguage',
  'numberOfSeasons',
  'numberOfEpisodes',
  'episodeRunTime',
  'posterPath',
  'backdropPath',
  'logoPath',
  'posterOverridePath',
  'voteAverage',
  'voteCount',
] as const satisfies ReadonlyArray<keyof CreateTvShowInput & keyof typeof tvShows.$inferInsert>;

function buildTvShowInsertValues(input: CreateTvShowInput): typeof tvShows.$inferInsert {
  const values: Record<string, unknown> = {
    tvdbId: input.tvdbId,
    name: input.name,
    genres: input.genres ? JSON.stringify(input.genres) : null,
    networks: input.networks ? JSON.stringify(input.networks) : null,
  };
  for (const key of TV_SHOW_NULLABLE_INSERT_KEYS) {
    values[key] = input[key] ?? null;
  }
  return values as typeof tvShows.$inferInsert;
}

const TV_SHOW_REQUIRED_UPDATE_KEYS = ['tvdbId', 'name'] as const satisfies ReadonlyArray<
  keyof UpdateTvShowInput & keyof typeof tvShows.$inferSelect
>;

const TV_SHOW_NULLABLE_UPDATE_KEYS = [
  'originalName',
  'overview',
  'firstAirDate',
  'lastAirDate',
  'status',
  'originalLanguage',
  'numberOfSeasons',
  'numberOfEpisodes',
  'episodeRunTime',
  'posterPath',
  'backdropPath',
  'logoPath',
  'posterOverridePath',
  'voteAverage',
  'voteCount',
] as const satisfies ReadonlyArray<keyof UpdateTvShowInput & keyof typeof tvShows.$inferSelect>;

const TV_SHOW_JSON_UPDATE_KEYS = ['genres', 'networks'] as const satisfies ReadonlyArray<
  keyof UpdateTvShowInput & keyof typeof tvShows.$inferSelect
>;

function buildTvShowUpdate(input: UpdateTvShowInput): Partial<typeof tvShows.$inferSelect> | null {
  const updates: Record<string, unknown> = {};
  let touched = false;

  for (const key of TV_SHOW_REQUIRED_UPDATE_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    updates[key] = value;
    touched = true;
  }

  for (const key of TV_SHOW_NULLABLE_UPDATE_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    updates[key] = value ?? null;
    touched = true;
  }

  for (const key of TV_SHOW_JSON_UPDATE_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    updates[key] = JSON.stringify(value);
    touched = true;
  }

  if (!touched) return null;
  updates.updatedAt = new Date().toISOString();
  return updates as Partial<typeof tvShows.$inferSelect>;
}

/** List TV shows with optional filters. Ordered by `name ASC`. */
export function listTvShows(
  db: MediaDb,
  filters: TvShowFilters,
  limit: number,
  offset: number
): TvShowListResult {
  const conditions: SQL[] = [];

  if (filters.search) {
    conditions.push(like(tvShows.name, `%${filters.search}%`));
  }
  if (filters.status) {
    conditions.push(eq(tvShows.status, filters.status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(tvShows)
    .where(where)
    .orderBy(asc(tvShows.name))
    .limit(limit)
    .offset(offset)
    .all();

  const [countRow] = db.select({ total: count() }).from(tvShows).where(where).all();

  return { rows, total: countRow?.total ?? 0 };
}

/** Get a single TV show by id. Throws `TvShowNotFoundError` if missing. */
export function getTvShow(db: MediaDb, id: number): TvShowRow {
  const row = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
  if (!row) throw new TvShowNotFoundError(id);
  return row;
}

/** Get a single TV show by TVDB id. Returns `null` if not found. */
export function getTvShowByTvdbId(db: MediaDb, tvdbId: number): TvShowRow | null {
  return db.select().from(tvShows).where(eq(tvShows.tvdbId, tvdbId)).get() ?? null;
}

/**
 * Create a new TV show. Returns the persisted row. Throws
 * `TvShowConflictError` when the `tvdbId` already exists (the unique index
 * raises a `UNIQUE constraint failed: tv_shows.tvdb_id` SQLITE_CONSTRAINT).
 */
export function createTvShow(db: MediaDb, input: CreateTvShowInput): TvShowRow {
  try {
    const result = db.insert(tvShows).values(buildTvShowInsertValues(input)).run();
    return getTvShow(db, Number(result.lastInsertRowid));
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new TvShowConflictError(input.tvdbId);
    }
    throw err;
  }
}

/**
 * Patch a TV show. Throws `TvShowNotFoundError` if missing. No-op writes
 * (empty `input`) still re-read the row but skip the UPDATE.
 */
export function updateTvShow(db: MediaDb, id: number, input: UpdateTvShowInput): TvShowRow {
  getTvShow(db, id);
  const updates = buildTvShowUpdate(input);
  if (updates) {
    db.update(tvShows).set(updates).where(eq(tvShows.id, id)).run();
  }
  return getTvShow(db, id);
}

/** Delete a TV show. Throws `TvShowNotFoundError` if missing. */
export function deleteTvShow(db: MediaDb, id: number): void {
  getTvShow(db, id);
  const result = db.delete(tvShows).where(eq(tvShows.id, id)).run();
  if (result.changes === 0) throw new TvShowNotFoundError(id);
}
