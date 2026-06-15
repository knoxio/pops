/**
 * Seasons CRUD — routes through the media pillar handle.
 *
 * `seasons` is owned by `@pops/media-db` and the library ingestion path
 * (`library/tv-show-service.ts`) already writes `seasons` rows via
 * `getMediaDrizzle()` inside an atomic `tv_shows` + `seasons` + `episodes`
 * transaction. Pinning these reads/writes to `getDrizzle()` would
 * split-brain against the ingestion writer (rows visible on `media.db`
 * but invisible to the season router and vice-versa). Flipping closes
 * that window — all `seasons` traffic now lands on the same store as
 * the library writer.
 *
 * FK parent (`tv_shows`) already resolves through `getMediaDrizzle()`
 * via `tv-shows-base.ts`, so the `getTvShow(tvShowId)` existence checks
 * in `listSeasons` / `createSeason` hit the same store as the season
 * insert.
 */
import { and, asc, eq } from 'drizzle-orm';

import { seasons } from '@pops/media-db';

import { getMediaDrizzle } from '../../../db/media-db-handle.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { getTvShow } from './tv-shows-base.js';

import type { SeasonRow } from '@pops/db-types';

import type { CreateSeasonInput } from './types.js';

export interface SeasonListResult {
  rows: SeasonRow[];
  total: number;
}

export function listSeasons(tvShowId: number): SeasonListResult {
  const db = getMediaDrizzle();
  getTvShow(tvShowId);
  const rows = db
    .select()
    .from(seasons)
    .where(eq(seasons.tvShowId, tvShowId))
    .orderBy(asc(seasons.seasonNumber))
    .all();
  return { rows, total: rows.length };
}

export function getSeason(id: number): SeasonRow {
  const db = getMediaDrizzle();
  const row = db.select().from(seasons).where(eq(seasons.id, id)).get();
  if (!row) throw new NotFoundError('Season', String(id));
  return row;
}

export function createSeason(input: CreateSeasonInput): SeasonRow {
  const db = getMediaDrizzle();
  getTvShow(input.tvShowId);

  const existing = db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.tvdbId, input.tvdbId))
    .get();
  if (existing) {
    throw new ConflictError(`Season with TVDB ID ${input.tvdbId} already exists`);
  }

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
  getSeason(id);
  const db = getMediaDrizzle();
  db.delete(seasons).where(eq(seasons.id, id)).run();
}
