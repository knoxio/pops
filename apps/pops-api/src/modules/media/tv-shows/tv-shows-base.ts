import { and, asc, count, eq, like } from 'drizzle-orm';

import { tvShows } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type { TvShowRow } from '@pops/db-types';

import type { CreateTvShowInput, UpdateTvShowInput } from './types.js';

export interface TvShowListResult {
  rows: TvShowRow[];
  total: number;
}

export function listTvShows(
  search: string | undefined,
  status: string | undefined,
  limit: number,
  offset: number
): TvShowListResult {
  const db = getDrizzle();
  const conditions = [];
  if (search) conditions.push(like(tvShows.name, `%${search}%`));
  if (status) conditions.push(eq(tvShows.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(tvShows)
    .where(where)
    .orderBy(asc(tvShows.name))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db.select({ total: count() }).from(tvShows).where(where).all()[0];
  return { rows, total: countRow?.total ?? 0 };
}

export function getTvShow(id: number): TvShowRow {
  const db = getDrizzle();
  const row = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
  if (!row) throw new NotFoundError('TvShow', String(id));
  return row;
}

export function getTvShowByTvdbId(tvdbId: number): TvShowRow | null {
  const db = getDrizzle();
  return db.select().from(tvShows).where(eq(tvShows.tvdbId, tvdbId)).get() ?? null;
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

function buildTvShowInsertValues(
  input: CreateTvShowInput,
  now: string
): typeof tvShows.$inferInsert {
  const values: Record<string, unknown> = {
    tvdbId: input.tvdbId,
    name: input.name,
    genres: input.genres ? JSON.stringify(input.genres) : null,
    networks: input.networks ? JSON.stringify(input.networks) : null,
    createdAt: now,
    updatedAt: now,
  };
  for (const key of TV_SHOW_NULLABLE_INSERT_KEYS) {
    values[key] = input[key] ?? null;
  }
  return values as typeof tvShows.$inferInsert;
}

export function createTvShow(input: CreateTvShowInput): TvShowRow {
  const db = getDrizzle();
  const existing = db
    .select({ id: tvShows.id })
    .from(tvShows)
    .where(eq(tvShows.tvdbId, input.tvdbId))
    .get();
  if (existing) {
    throw new ConflictError(`TV show with TVDB ID ${input.tvdbId} already exists`);
  }
  const now = new Date().toISOString();
  db.insert(tvShows).values(buildTvShowInsertValues(input, now)).run();
  const row = db.select().from(tvShows).where(eq(tvShows.tvdbId, input.tvdbId)).get();
  if (!row) throw new Error(`TV show with TVDB ID ${input.tvdbId} not found after insert`);
  return row;
}

const TV_SHOW_NULLABLE_KEYS = [
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
] as const satisfies ReadonlyArray<keyof UpdateTvShowInput & keyof typeof tvShows.$inferInsert>;

const TV_SHOW_JSON_KEYS = ['genres', 'networks'] as const satisfies ReadonlyArray<
  keyof UpdateTvShowInput & keyof typeof tvShows.$inferInsert
>;

function buildTvShowUpdate(input: UpdateTvShowInput): Partial<typeof tvShows.$inferInsert> | null {
  const updates: Record<string, unknown> = {};
  let touched = false;

  if (input.name !== undefined) {
    updates.name = input.name;
    touched = true;
  }

  for (const key of TV_SHOW_NULLABLE_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    updates[key] = value ?? null;
    touched = true;
  }

  for (const key of TV_SHOW_JSON_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    updates[key] = JSON.stringify(value);
    touched = true;
  }

  if (!touched) return null;
  updates.updatedAt = new Date().toISOString();
  return updates as Partial<typeof tvShows.$inferInsert>;
}

export function updateTvShow(id: number, input: UpdateTvShowInput): TvShowRow {
  getTvShow(id);
  const updates = buildTvShowUpdate(input);
  if (updates) {
    getDrizzle().update(tvShows).set(updates).where(eq(tvShows.id, id)).run();
  }
  return getTvShow(id);
}

export function deleteTvShow(id: number): void {
  getTvShow(id);
  const db = getDrizzle();
  db.delete(tvShows).where(eq(tvShows.id, id)).run();
}
