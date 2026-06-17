/**
 * Seasons CRUD against the media pillar's SQLite via drizzle.
 *
 * Lifted from the pops-api monolith `tv-shows/seasons-service.ts` and
 * converted to the pillar's `(db, …)` arg-passing + db-domain-error pattern
 * (the monolith threw HTTP errors directly; the pillar keeps the db layer
 * HTTP-free and maps to status codes at the handler boundary).
 */
import { and, asc, eq } from 'drizzle-orm';

import { SeasonConflictError, SeasonNotFoundError } from '../errors.js';
import { seasons } from '../schema.js';
import { getTvShow } from './tv-shows.js';

import type { SeasonRow } from '../row-types.js';
import type { MediaDb } from './internal.js';

export type { SeasonRow };

export interface SeasonListResult {
  rows: SeasonRow[];
  total: number;
}

export interface CreateSeasonInput {
  tvShowId: number;
  tvdbId: number;
  seasonNumber: number;
  name?: string | null;
  overview?: string | null;
  posterPath?: string | null;
  airDate?: string | null;
  episodeCount?: number | null;
}

/** List a show's seasons ordered by season number. Validates the parent show exists. */
export function listSeasons(db: MediaDb, tvShowId: number): SeasonListResult {
  getTvShow(db, tvShowId);
  const rows = db
    .select()
    .from(seasons)
    .where(eq(seasons.tvShowId, tvShowId))
    .orderBy(asc(seasons.seasonNumber))
    .all();
  return { rows, total: rows.length };
}

/** Get a single season by id. Throws `SeasonNotFoundError` if missing. */
export function getSeason(db: MediaDb, id: number): SeasonRow {
  const row = db.select().from(seasons).where(eq(seasons.id, id)).get();
  if (!row) throw new SeasonNotFoundError(id);
  return row;
}

/**
 * Create a season. Validates the parent show exists, and rejects duplicate
 * `tvdbId` or duplicate `(tvShowId, seasonNumber)` with `SeasonConflictError`.
 */
export function createSeason(db: MediaDb, input: CreateSeasonInput): SeasonRow {
  getTvShow(db, input.tvShowId);

  const existing = db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.tvdbId, input.tvdbId))
    .get();
  if (existing) {
    throw new SeasonConflictError(`Season with TVDB ID ${input.tvdbId} already exists`);
  }

  const duplicateNumber = db
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.tvShowId, input.tvShowId), eq(seasons.seasonNumber, input.seasonNumber)))
    .get();
  if (duplicateNumber) {
    throw new SeasonConflictError(`Season ${input.seasonNumber} already exists for this show`);
  }

  const result = db
    .insert(seasons)
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
  return getSeason(db, Number(result.lastInsertRowid));
}

/** Delete a season. Throws `SeasonNotFoundError` if missing. */
export function deleteSeason(db: MediaDb, id: number): void {
  getSeason(db, id);
  db.delete(seasons).where(eq(seasons.id, id)).run();
}

export interface UpsertSeasonInput {
  tvShowId: number;
  tvdbId: number;
  seasonNumber: number;
  name?: string | null;
  overview?: string | null;
  posterPath?: string | null;
  episodeCount?: number | null;
}

export interface UpsertSeasonResult {
  seasonId: number;
  added: boolean;
}

/**
 * Upsert a season keyed by `tvdbId` — insert when new, patch when existing.
 * `episodeCount` is only written when non-null (the refresh path computes it
 * later from fetched episodes). Used by the TheTVDB refresh orchestration.
 */
export function upsertSeasonByTvdbId(db: MediaDb, input: UpsertSeasonInput): UpsertSeasonResult {
  const existing = db.select().from(seasons).where(eq(seasons.tvdbId, input.tvdbId)).get();
  const episodeCount = input.episodeCount ?? null;

  if (existing) {
    db.update(seasons)
      .set({
        name: input.name ?? null,
        overview: input.overview ?? null,
        posterPath: input.posterPath ?? null,
        ...(episodeCount != null ? { episodeCount } : {}),
      })
      .where(eq(seasons.id, existing.id))
      .run();
    return { seasonId: existing.id, added: false };
  }

  const result = db
    .insert(seasons)
    .values({
      tvShowId: input.tvShowId,
      tvdbId: input.tvdbId,
      seasonNumber: input.seasonNumber,
      name: input.name ?? null,
      overview: input.overview ?? null,
      posterPath: input.posterPath ?? null,
      episodeCount,
    })
    .run();
  return { seasonId: Number(result.lastInsertRowid), added: true };
}

/** Set a season's cached episode count. No-op when `episodeCount <= 0`. */
export function setSeasonEpisodeCount(db: MediaDb, seasonId: number, episodeCount: number): void {
  if (episodeCount <= 0) return;
  db.update(seasons).set({ episodeCount }).where(eq(seasons.id, seasonId)).run();
}
