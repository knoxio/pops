/**
 * TV Shows service — CRUD operations for tv_shows, seasons, and episodes.
 */
import type { EpisodeRow, SeasonRow, TvShowRow } from '@pops/db-types';
import { episodes, seasons, tvShows } from '@pops/db-types';
import { and, asc, count, eq, like } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
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

export function updateTvShow(id: number, input: UpdateTvShowInput): TvShowRow {
  const db = getDrizzle();
  getTvShow(id); // verify exists

  const updates: Partial<typeof tvShows.$inferInsert> = {};
  let hasUpdates = false;

  if (input.name !== undefined) {
    updates.name = input.name;
    hasUpdates = true;
  }
  if (input.originalName !== undefined) {
    updates.originalName = input.originalName ?? null;
    hasUpdates = true;
  }
  if (input.overview !== undefined) {
    updates.overview = input.overview ?? null;
    hasUpdates = true;
  }
  if (input.firstAirDate !== undefined) {
    updates.firstAirDate = input.firstAirDate ?? null;
    hasUpdates = true;
  }
  if (input.lastAirDate !== undefined) {
    updates.lastAirDate = input.lastAirDate ?? null;
    hasUpdates = true;
  }
  if (input.status !== undefined) {
    updates.status = input.status ?? null;
    hasUpdates = true;
  }
  if (input.originalLanguage !== undefined) {
    updates.originalLanguage = input.originalLanguage ?? null;
    hasUpdates = true;
  }
  if (input.numberOfSeasons !== undefined) {
    updates.numberOfSeasons = input.numberOfSeasons ?? null;
    hasUpdates = true;
  }
  if (input.numberOfEpisodes !== undefined) {
    updates.numberOfEpisodes = input.numberOfEpisodes ?? null;
    hasUpdates = true;
  }
  if (input.episodeRunTime !== undefined) {
    updates.episodeRunTime = input.episodeRunTime ?? null;
    hasUpdates = true;
  }
  if (input.posterPath !== undefined) {
    updates.posterPath = input.posterPath ?? null;
    hasUpdates = true;
  }
  if (input.backdropPath !== undefined) {
    updates.backdropPath = input.backdropPath ?? null;
    hasUpdates = true;
  }
  if (input.logoPath !== undefined) {
    updates.logoPath = input.logoPath ?? null;
    hasUpdates = true;
  }
  if (input.posterOverridePath !== undefined) {
    updates.posterOverridePath = input.posterOverridePath ?? null;
    hasUpdates = true;
  }
  if (input.voteAverage !== undefined) {
    updates.voteAverage = input.voteAverage ?? null;
    hasUpdates = true;
  }
  if (input.voteCount !== undefined) {
    updates.voteCount = input.voteCount ?? null;
    hasUpdates = true;
  }
  if (input.genres !== undefined) {
    updates.genres = JSON.stringify(input.genres);
    hasUpdates = true;
  }
  if (input.networks !== undefined) {
    updates.networks = JSON.stringify(input.networks);
    hasUpdates = true;
  }

  if (hasUpdates) {
    updates.updatedAt = new Date().toISOString();
    db.update(tvShows).set(updates).where(eq(tvShows.id, id)).run();
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
