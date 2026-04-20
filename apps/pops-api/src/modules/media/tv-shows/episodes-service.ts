import { and, asc, eq } from 'drizzle-orm';

import { episodes } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { getSeason } from './seasons-service.js';

import type { EpisodeRow } from '@pops/db-types';

import type { CreateEpisodeInput } from './types.js';

export interface EpisodeListResult {
  rows: EpisodeRow[];
  total: number;
}

export function listEpisodes(seasonId: number): EpisodeListResult {
  const db = getDrizzle();
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
  const db = getDrizzle();
  const row = db.select().from(episodes).where(eq(episodes.id, id)).get();
  if (!row) throw new NotFoundError('Episode', String(id));
  return row;
}

export function createEpisode(input: CreateEpisodeInput): EpisodeRow {
  const db = getDrizzle();
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
  const db = getDrizzle();
  db.delete(episodes).where(eq(episodes.id, id)).run();
}
