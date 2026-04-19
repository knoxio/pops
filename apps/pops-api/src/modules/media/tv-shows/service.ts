import { and, asc, count, eq, like } from 'drizzle-orm';

import { episodes, seasons, tvShows } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

/**
 * TV Shows service — CRUD operations for tv_shows, seasons, and episodes.
 */
import type { EpisodeRow, SeasonRow, TvShowRow } from '@pops/db-types';

import type {
  CreateEpisodeInput,
  CreateSeasonInput,
  CreateTvShowInput,
  UpdateTvShowInput,
} from './types.js';

// ── TV Shows ──

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

  if (search) {
    conditions.push(like(tvShows.name, `%${search}%`));
  }
  if (status) {
    conditions.push(eq(tvShows.status, status));
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

  const countRow = db.select({ total: count() }).from(tvShows).where(where).all()[0];
  const total = countRow?.total ?? 0;

  return { rows, total };
}

export function getTvShow(id: number): TvShowRow {
  const db = getDrizzle();
  const row = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
  if (!row) throw new NotFoundError('TvShow', String(id));
  return row;
}

/** Look up a TV show by TVDB ID. Returns null if not found. */
export function getTvShowByTvdbId(tvdbId: number): TvShowRow | null {
  const db = getDrizzle();
  return db.select().from(tvShows).where(eq(tvShows.tvdbId, tvdbId)).get() ?? null;
}

export function createTvShow(input: CreateTvShowInput): TvShowRow {
  const db = getDrizzle();

  // Check for duplicate tvdbId
  const existing = db
    .select({ id: tvShows.id })
    .from(tvShows)
    .where(eq(tvShows.tvdbId, input.tvdbId))
    .get();

  if (existing) {
    throw new ConflictError(`TV show with TVDB ID ${input.tvdbId} already exists`);
  }

  const now = new Date().toISOString();

  db.insert(tvShows)
    .values({
      tvdbId: input.tvdbId,
      name: input.name,
      originalName: input.originalName ?? null,
      overview: input.overview ?? null,
      firstAirDate: input.firstAirDate ?? null,
      lastAirDate: input.lastAirDate ?? null,
      status: input.status ?? null,
      originalLanguage: input.originalLanguage ?? null,
      numberOfSeasons: input.numberOfSeasons ?? null,
      numberOfEpisodes: input.numberOfEpisodes ?? null,
      episodeRunTime: input.episodeRunTime ?? null,
      posterPath: input.posterPath ?? null,
      backdropPath: input.backdropPath ?? null,
      logoPath: input.logoPath ?? null,
      posterOverridePath: input.posterOverridePath ?? null,
      voteAverage: input.voteAverage ?? null,
      voteCount: input.voteCount ?? null,
      genres: input.genres ? JSON.stringify(input.genres) : null,
      networks: input.networks ? JSON.stringify(input.networks) : null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Retrieve by tvdbId since id is autoincrement
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
  getTvShow(id); // verify exists
  const db = getDrizzle();
  db.delete(tvShows).where(eq(tvShows.id, id)).run();
}

// ── Seasons ──

export interface SeasonListResult {
  rows: SeasonRow[];
  total: number;
}

export function listSeasons(tvShowId: number): SeasonListResult {
  const db = getDrizzle();
  getTvShow(tvShowId); // verify show exists

  const rows = db
    .select()
    .from(seasons)
    .where(eq(seasons.tvShowId, tvShowId))
    .orderBy(asc(seasons.seasonNumber))
    .all();

  return { rows, total: rows.length };
}

export function getSeason(id: number): SeasonRow {
  const db = getDrizzle();
  const row = db.select().from(seasons).where(eq(seasons.id, id)).get();
  if (!row) throw new NotFoundError('Season', String(id));
  return row;
}

export function createSeason(input: CreateSeasonInput): SeasonRow {
  const db = getDrizzle();
  getTvShow(input.tvShowId); // verify show exists

  // Check for duplicate tvdbId
  const existing = db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.tvdbId, input.tvdbId))
    .get();

  if (existing) {
    throw new ConflictError(`Season with TVDB ID ${input.tvdbId} already exists`);
  }

  // Check for duplicate season number within the show
  const duplicateNumber = db
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.tvShowId, input.tvShowId), eq(seasons.seasonNumber, input.seasonNumber)))
    .get();

  if (duplicateNumber) {
    throw new ConflictError(`Season ${input.seasonNumber} already exists for this show`);
  }

  db.insert(seasons)
    .values({
      tvShowId: input.tvShowId,
      tvdbId: input.tvdbId,
      seasonNumber: input.seasonNumber,
      name: input.name ?? null,
      overview: input.overview ?? null,
      posterPath: input.posterPath ?? null,
      airDate: input.airDate ?? null,
      episodeCount: input.episodeCount ?? null,
    })
    .run();

  const row = db.select().from(seasons).where(eq(seasons.tvdbId, input.tvdbId)).get();

  if (!row) throw new Error(`Season with TVDB ID ${input.tvdbId} not found after insert`);
  return row;
}

export function deleteSeason(id: number): void {
  getSeason(id); // verify exists
  const db = getDrizzle();
  db.delete(seasons).where(eq(seasons.id, id)).run();
}

// ── Episodes ──

export interface EpisodeListResult {
  rows: EpisodeRow[];
  total: number;
}

export function listEpisodes(seasonId: number): EpisodeListResult {
  const db = getDrizzle();
  getSeason(seasonId); // verify season exists

  const rows = db
    .select()
    .from(episodes)
    .where(eq(episodes.seasonId, seasonId))
    .orderBy(asc(episodes.episodeNumber))
    .all();

  return { rows, total: rows.length };
}

export function getEpisode(id: number): EpisodeRow {
  const db = getDrizzle();
  const row = db.select().from(episodes).where(eq(episodes.id, id)).get();
  if (!row) throw new NotFoundError('Episode', String(id));
  return row;
}

export function createEpisode(input: CreateEpisodeInput): EpisodeRow {
  const db = getDrizzle();
  getSeason(input.seasonId); // verify season exists

  // Check for duplicate tvdbId
  const existing = db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.tvdbId, input.tvdbId))
    .get();

  if (existing) {
    throw new ConflictError(`Episode with TVDB ID ${input.tvdbId} already exists`);
  }

  // Check for duplicate episode number within the season
  const duplicateNumber = db
    .select({ id: episodes.id })
    .from(episodes)
    .where(
      and(eq(episodes.seasonId, input.seasonId), eq(episodes.episodeNumber, input.episodeNumber))
    )
    .get();

  if (duplicateNumber) {
    throw new ConflictError(`Episode ${input.episodeNumber} already exists for this season`);
  }

  db.insert(episodes)
    .values({
      seasonId: input.seasonId,
      tvdbId: input.tvdbId,
      episodeNumber: input.episodeNumber,
      name: input.name ?? null,
      overview: input.overview ?? null,
      airDate: input.airDate ?? null,
      stillPath: input.stillPath ?? null,
      voteAverage: input.voteAverage ?? null,
      runtime: input.runtime ?? null,
    })
    .run();

  const row = db.select().from(episodes).where(eq(episodes.tvdbId, input.tvdbId)).get();

  if (!row) throw new Error(`Episode with TVDB ID ${input.tvdbId} not found after insert`);
  return row;
}

export function deleteEpisode(id: number): void {
  getEpisode(id); // verify exists
  const db = getDrizzle();
  db.delete(episodes).where(eq(episodes.id, id)).run();
}
