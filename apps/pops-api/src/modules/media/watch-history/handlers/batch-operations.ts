import { and, countDistinct, eq, inArray, isNotNull, lte } from 'drizzle-orm';

import { episodes, mediaWatchlist, seasons, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { resetStaleness } from '../../comparisons/staleness.js';
import { resequencePriorities } from '../../watchlist/service.js';

import type { BatchLogWatchInput } from '../types.js';

export interface BatchLogResult {
  logged: number;
  skipped: number;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDrizzle>['transaction']>[0]>[0];

function getEpisodeIdsForBatch(
  tx: Tx,
  input: BatchLogWatchInput,
  airedFilter: ReturnType<typeof and>
): number[] {
  if (input.mediaType === 'season') {
    return tx
      .select({ id: episodes.id })
      .from(episodes)
      .where(and(eq(episodes.seasonId, input.mediaId), airedFilter))
      .all()
      .map((r) => r.id);
  }
  return tx
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(and(eq(seasons.tvShowId, input.mediaId), airedFilter))
    .all()
    .map((r) => r.id);
}

function getAlreadyWatchedIds(tx: Tx, episodeIds: number[], completed: number): Set<number> {
  if (completed !== 1) return new Set<number>();
  const rows = tx
    .select({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, 'episode'),
        eq(watchHistory.completed, 1),
        inArray(watchHistory.mediaId, episodeIds)
      )
    )
    .all();
  return new Set(rows.map((r) => r.mediaId));
}

function getBlacklistedIds(tx: Tx, episodeIds: number[], watchedAt: string): Set<number> {
  const rows = tx
    .select({ mediaId: watchHistory.mediaId })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, 'episode'),
        eq(watchHistory.blacklisted, 1),
        eq(watchHistory.watchedAt, watchedAt),
        inArray(watchHistory.mediaId, episodeIds)
      )
    )
    .all();
  return new Set(rows.map((r) => r.mediaId));
}

function insertWatchEvents(
  tx: Tx,
  episodeIds: number[],
  watchedAt: string,
  completed: number
): void {
  for (const episodeId of episodeIds) {
    tx.insert(watchHistory)
      .values({ mediaType: 'episode', mediaId: episodeId, watchedAt, completed })
      .onConflictDoNothing()
      .run();
  }
}

function resolveTvShowId(tx: Tx, input: BatchLogWatchInput): number | undefined {
  if (input.mediaType === 'show') return input.mediaId;
  const season = tx
    .select({ tvShowId: seasons.tvShowId })
    .from(seasons)
    .where(eq(seasons.id, input.mediaId))
    .get();
  return season?.tvShowId;
}

function getAllShowEpisodeIds(tx: Tx, tvShowId: number): number[] {
  return tx
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .all()
    .map((r) => r.id);
}

function countWatchedEpisodes(tx: Tx, episodeIds: number[]): number {
  if (episodeIds.length === 0) return 0;
  const row = tx
    .select({ watched: countDistinct(watchHistory.mediaId) })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, 'episode'),
        eq(watchHistory.completed, 1),
        inArray(watchHistory.mediaId, episodeIds)
      )
    )
    .all()[0];
  return row?.watched ?? 0;
}

function maybeRemoveCompletedShowFromWatchlist(tx: Tx, tvShowId: number): void {
  const allShowEpisodeIds = getAllShowEpisodeIds(tx, tvShowId);
  if (allShowEpisodeIds.length === 0) return;

  const watched = countWatchedEpisodes(tx, allShowEpisodeIds);
  if (watched < allShowEpisodeIds.length) return;

  const removeResult = tx
    .delete(mediaWatchlist)
    .where(and(eq(mediaWatchlist.mediaType, 'tv_show'), eq(mediaWatchlist.mediaId, tvShowId)))
    .run();
  if (removeResult.changes > 0) {
    resequencePriorities(tx);
  }
}

function handleShowSideEffects(tx: Tx, input: BatchLogWatchInput): void {
  const tvShowId = resolveTvShowId(tx, input);
  if (tvShowId === undefined) return;

  resetStaleness('tv_show', tvShowId);
  maybeRemoveCompletedShowFromWatchlist(tx, tvShowId);
}

function runBatchLogTransaction(input: BatchLogWatchInput, completed: number, watchedAt: string) {
  return (tx: Tx): BatchLogResult => {
    const today = new Date().toISOString().slice(0, 10);
    const airedFilter = and(isNotNull(episodes.airDate), lte(episodes.airDate, today));

    const episodeIds = getEpisodeIdsForBatch(tx, input, airedFilter);
    if (episodeIds.length === 0) return { logged: 0, skipped: 0 };

    const alreadyWatched = getAlreadyWatchedIds(tx, episodeIds, completed);
    const blacklistedIds = getBlacklistedIds(tx, episodeIds, watchedAt);
    const toLog = episodeIds.filter((id) => !alreadyWatched.has(id) && !blacklistedIds.has(id));

    insertWatchEvents(tx, toLog, watchedAt, completed);

    if (completed === 1 && toLog.length > 0) {
      handleShowSideEffects(tx, input);
    }

    return { logged: toLog.length, skipped: episodeIds.length - toLog.length };
  };
}

export function batchLogWatch(input: BatchLogWatchInput): BatchLogResult {
  const db = getDrizzle();
  const completed = input.completed ?? 1;
  const watchedAt = input.watchedAt ?? new Date().toISOString();
  return db.transaction(runBatchLogTransaction(input, completed, watchedAt));
}
