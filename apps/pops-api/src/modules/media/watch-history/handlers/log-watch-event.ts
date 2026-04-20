import { and, countDistinct, eq, inArray } from 'drizzle-orm';

import { episodes, mediaWatchlist, seasons, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { resetStaleness } from '../../comparisons/staleness.js';
import { createDebriefSession, queueDebriefStatus } from '../../debrief/service.js';
import { resequencePriorities } from '../../watchlist/service.js';

import type { LogWatchInput, WatchHistoryRow } from '../types.js';

type Tx = Parameters<Parameters<ReturnType<typeof getDrizzle>['transaction']>[0]>[0];

export interface LogWatchResult {
  entry: WatchHistoryRow;
  created: boolean;
  watchlistRemoved: boolean;
}

function findBlacklistedEntry(
  tx: Tx,
  input: LogWatchInput,
  watchedAt: string
): WatchHistoryRow | undefined {
  return tx
    .select()
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, input.mediaType),
        eq(watchHistory.mediaId, input.mediaId),
        eq(watchHistory.watchedAt, watchedAt),
        eq(watchHistory.blacklisted, 1)
      )
    )
    .get();
}

function findExistingEntry(
  tx: Tx,
  input: LogWatchInput,
  watchedAt: string
): WatchHistoryRow | undefined {
  return tx
    .select()
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, input.mediaType),
        eq(watchHistory.mediaId, input.mediaId),
        eq(watchHistory.watchedAt, watchedAt)
      )
    )
    .get();
}

function resolveCompTarget(tx: Tx, input: LogWatchInput): { type: string; id: number } {
  if (input.mediaType !== 'episode') return { type: input.mediaType, id: input.mediaId };
  const ep = tx
    .select({ seasonId: episodes.seasonId })
    .from(episodes)
    .where(eq(episodes.id, input.mediaId))
    .get();
  if (!ep) return { type: input.mediaType, id: input.mediaId };
  const season = tx
    .select({ tvShowId: seasons.tvShowId })
    .from(seasons)
    .where(eq(seasons.id, ep.seasonId))
    .get();
  if (!season) return { type: input.mediaType, id: input.mediaId };
  return { type: 'tv_show', id: season.tvShowId };
}

function handleCompletion(tx: Tx, entryId: number, input: LogWatchInput): void {
  const target = resolveCompTarget(tx, input);
  resetStaleness(target.type, target.id);
  createDebriefSession(entryId);
  queueDebriefStatus(target.type, target.id);
}

function removeFromWatchlist(tx: Tx, input: LogWatchInput): boolean {
  if (input.mediaType === 'movie') {
    const deleteResult = tx
      .delete(mediaWatchlist)
      .where(and(eq(mediaWatchlist.mediaType, 'movie'), eq(mediaWatchlist.mediaId, input.mediaId)))
      .run();
    return deleteResult.changes > 0;
  }
  if (input.mediaType === 'episode') {
    return autoRemoveTvShowIfFullyWatched(tx, input.mediaId);
  }
  return false;
}

export function logWatch(input: LogWatchInput): LogWatchResult {
  const db = getDrizzle();
  const completed = input.completed ?? 1;
  const watchedAt = input.watchedAt ?? new Date().toISOString();

  return db.transaction((tx) => {
    const blacklisted = findBlacklistedEntry(tx, input, watchedAt);
    if (blacklisted) {
      return { entry: blacklisted, created: false, watchlistRemoved: false };
    }

    const result = tx
      .insert(watchHistory)
      .values({ mediaType: input.mediaType, mediaId: input.mediaId, watchedAt, completed })
      .onConflictDoNothing()
      .run();

    if (result.changes === 0) {
      const existing = findExistingEntry(tx, input, watchedAt);
      if (!existing) throw new Error('Watch history entry not found after conflict');
      return { entry: existing, created: false, watchlistRemoved: false };
    }

    const entry = tx
      .select()
      .from(watchHistory)
      .where(eq(watchHistory.id, Number(result.lastInsertRowid)))
      .get();
    if (!entry) throw new Error('Watch history entry not found after insert');

    if (completed === 1) {
      handleCompletion(tx, entry.id, input);
    }

    let watchlistRemoved = false;
    if (completed === 1 && input.source !== 'plex_sync') {
      watchlistRemoved = removeFromWatchlist(tx, input);
      if (watchlistRemoved) resequencePriorities(tx);
    }

    return { entry, created: true, watchlistRemoved };
  });
}

export function autoRemoveTvShowIfFullyWatched(tx: Tx, episodeId: number): boolean {
  const episode = tx
    .select({ seasonId: episodes.seasonId })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .get();
  if (!episode) return false;

  const season = tx
    .select({ tvShowId: seasons.tvShowId })
    .from(seasons)
    .where(eq(seasons.id, episode.seasonId))
    .get();
  if (!season) return false;

  const tvShowId = season.tvShowId;
  const showEpisodeIds = tx
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .all()
    .map((r) => r.id);

  if (showEpisodeIds.length === 0) return false;

  const watchedRow = tx
    .select({ watched: countDistinct(watchHistory.mediaId) })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, 'episode'),
        eq(watchHistory.completed, 1),
        inArray(watchHistory.mediaId, showEpisodeIds)
      )
    )
    .all()[0];
  const watched = watchedRow?.watched ?? 0;

  if (watched >= showEpisodeIds.length) {
    const deleteResult = tx
      .delete(mediaWatchlist)
      .where(and(eq(mediaWatchlist.mediaType, 'tv_show'), eq(mediaWatchlist.mediaId, tvShowId)))
      .run();
    return deleteResult.changes > 0;
  }
  return false;
}
