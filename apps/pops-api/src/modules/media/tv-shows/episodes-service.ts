/**
 * Episodes CRUD — routes through the media pillar handle.
 *
 * `episodes` is owned by `@pops/media-db` and the library ingestion path
 * (`library/tv-show-service.ts`) already inserts `episodes` rows via
 * `getMediaDrizzle()` inside an atomic `tv_shows` + `seasons` +
 * `episodes` transaction. Pinning these reads/writes to `getDrizzle()`
 * would split-brain against the ingestion writer (rows visible on
 * `media.db` but invisible to the episode router and vice-versa).
 * Flipping closes that window — all `episodes` traffic now lands on the
 * same store as the library writer.
 *
 * FK parent (`seasons`) resolves through `getMediaDrizzle()` via
 * `seasons-service.ts`, so the `getSeason(seasonId)` existence checks
 * in `listEpisodes` / `createEpisode` hit the same store as the episode
 * insert.
 */
import { and, asc, eq } from 'drizzle-orm';

import { episodes } from '@pops/media-db';

import { getMediaDrizzle } from '../../../db/media-db-handle.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { getSeason } from './seasons-service.js';

import type { EpisodeRow } from '@pops/db-types';

import type { CreateEpisodeInput } from './types.js';

export interface EpisodeListResult {
  rows: EpisodeRow[];
  total: number;
}

export function listEpisodes(seasonId: number): EpisodeListResult {
  const db = getMediaDrizzle();
  getSeason(seasonId);
  const rows = db
    .select()
    .from(episodes)
    .where(eq(episodes.seasonId, seasonId))
    .orderBy(asc(episodes.episodeNumber))
    .all();
  return { rows, total: rows.length };
}

export function getEpisode(id: number): EpisodeRow {
  const db = getMediaDrizzle();
  const row = db.select().from(episodes).where(eq(episodes.id, id)).get();
  if (!row) throw new NotFoundError('Episode', String(id));
  return row;
}

export function createEpisode(input: CreateEpisodeInput): EpisodeRow {
  const db = getMediaDrizzle();
  getSeason(input.seasonId);

  const existing = db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.tvdbId, input.tvdbId))
    .get();
  if (existing) {
    throw new ConflictError(`Episode with TVDB ID ${input.tvdbId} already exists`);
  }

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
  getEpisode(id);
  const db = getMediaDrizzle();
  db.delete(episodes).where(eq(episodes.id, id)).run();
}
