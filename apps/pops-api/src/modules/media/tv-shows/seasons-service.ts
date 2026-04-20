import { and, asc, eq } from 'drizzle-orm';

import { seasons } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { getTvShow } from './tv-shows-base.js';

import type { SeasonRow } from '@pops/db-types';

import type { CreateSeasonInput } from './types.js';

export interface SeasonListResult {
  rows: SeasonRow[];
  total: number;
}

export function listSeasons(tvShowId: number): SeasonListResult {
  const db = getDrizzle();
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
  const db = getDrizzle();
  const row = db.select().from(seasons).where(eq(seasons.id, id)).get();
  if (!row) throw new NotFoundError('Season', String(id));
  return row;
}

export function createSeason(input: CreateSeasonInput): SeasonRow {
  const db = getDrizzle();
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
  const db = getDrizzle();
  db.delete(seasons).where(eq(seasons.id, id)).run();
}
