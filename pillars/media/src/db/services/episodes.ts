/**
 * Episodes CRUD against the media pillar's SQLite via drizzle.
 *
 * Lifted from the pops-api monolith `tv-shows/episodes-service.ts` and
 * converted to the pillar's `(db, …)` arg-passing + db-domain-error pattern.
 */
import { and, asc, count, eq } from 'drizzle-orm';

import { EpisodeConflictError, EpisodeNotFoundError } from '../errors.js';
import { episodes, seasons } from '../schema.js';
import { getSeason } from './seasons.js';

import type { EpisodeRow } from '../row-types.js';
import type { MediaDb } from './internal.js';

export type { EpisodeRow };

export interface EpisodeListResult {
  rows: EpisodeRow[];
  total: number;
}

export interface CreateEpisodeInput {
  seasonId: number;
  tvdbId: number;
  episodeNumber: number;
  name?: string | null;
  overview?: string | null;
  airDate?: string | null;
  stillPath?: string | null;
  voteAverage?: number | null;
  runtime?: number | null;
}

/** List a season's episodes ordered by episode number. Validates the parent season exists. */
export function listEpisodes(db: MediaDb, seasonId: number): EpisodeListResult {
  getSeason(db, seasonId);
  const rows = db
    .select()
    .from(episodes)
    .where(eq(episodes.seasonId, seasonId))
    .orderBy(asc(episodes.episodeNumber))
    .all();
  return { rows, total: rows.length };
}

/** Get a single episode by id. Throws `EpisodeNotFoundError` if missing. */
export function getEpisode(db: MediaDb, id: number): EpisodeRow {
  const row = db.select().from(episodes).where(eq(episodes.id, id)).get();
  if (!row) throw new EpisodeNotFoundError(id);
  return row;
}

/**
 * Create an episode. Validates the parent season exists, and rejects
 * duplicate `tvdbId` or duplicate `(seasonId, episodeNumber)` with
 * `EpisodeConflictError`.
 */
export function createEpisode(db: MediaDb, input: CreateEpisodeInput): EpisodeRow {
  getSeason(db, input.seasonId);

  const existing = db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.tvdbId, input.tvdbId))
    .get();
  if (existing) {
    throw new EpisodeConflictError(`Episode with TVDB ID ${input.tvdbId} already exists`);
  }

  const duplicateNumber = db
    .select({ id: episodes.id })
    .from(episodes)
    .where(
      and(eq(episodes.seasonId, input.seasonId), eq(episodes.episodeNumber, input.episodeNumber))
    )
    .get();
  if (duplicateNumber) {
    throw new EpisodeConflictError(`Episode ${input.episodeNumber} already exists for this season`);
  }

  const result = db
    .insert(episodes)
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
  return getEpisode(db, Number(result.lastInsertRowid));
}

/** Delete an episode. Throws `EpisodeNotFoundError` if missing. */
export function deleteEpisode(db: MediaDb, id: number): void {
  getEpisode(db, id);
  db.delete(episodes).where(eq(episodes.id, id)).run();
}

export interface UpsertEpisodeInput {
  seasonId: number;
  tvdbId: number;
  episodeNumber: number;
  name?: string | null;
  overview?: string | null;
  airDate?: string | null;
  runtime?: number | null;
}

/**
 * Upsert an episode keyed by `tvdbId` — insert when new, patch when existing.
 * Returns whether a new row was inserted. Used by the TheTVDB refresh
 * orchestration; unlike {@link createEpisode} it does not throw on conflict.
 */
export function upsertEpisodeByTvdbId(db: MediaDb, input: UpsertEpisodeInput): { added: boolean } {
  const existing = db.select().from(episodes).where(eq(episodes.tvdbId, input.tvdbId)).get();
  if (existing) {
    db.update(episodes)
      .set({
        name: input.name ?? null,
        overview: input.overview ?? null,
        airDate: input.airDate ?? null,
        runtime: input.runtime ?? null,
        episodeNumber: input.episodeNumber,
      })
      .where(eq(episodes.id, existing.id))
      .run();
    return { added: false };
  }
  db.insert(episodes)
    .values({
      seasonId: input.seasonId,
      tvdbId: input.tvdbId,
      episodeNumber: input.episodeNumber,
      name: input.name ?? null,
      overview: input.overview ?? null,
      airDate: input.airDate ?? null,
      runtime: input.runtime ?? null,
    })
    .run();
  return { added: true };
}

/** Count every episode belonging to a TV show (across all its seasons). */
export function countShowEpisodes(db: MediaDb, tvShowId: number): number {
  const row = db
    .select({ total: count() })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .get();
  return row?.total ?? 0;
}
