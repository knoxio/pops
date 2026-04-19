import { and, countDistinct, eq, inArray } from 'drizzle-orm';

import { episodes, mediaWatchlist, seasons, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { resetStaleness } from '../../comparisons/staleness.js';
import { createDebriefSession, queueDebriefStatus } from '../../debrief/service.js';
import { resequencePriorities } from '../../watchlist/service.js';

import type { LogWatchInput, WatchHistoryRow } from '../types.js';

export interface LogWatchResult {
  entry: WatchHistoryRow;
  /** True if a new row was inserted, false if it already existed (duplicate). */
  created: boolean;
  watchlistRemoved: boolean;
}

export function logWatch(input: LogWatchInput): LogWatchResult {
  const db = getDrizzle();
  const completed = input.completed ?? 1;
  const watchedAt = input.watchedAt ?? new Date().toISOString();

  return db.transaction((tx) => {
    const blacklisted = tx
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
    if (blacklisted) {
      return { entry: blacklisted, created: false, watchlistRemoved: false };
    }

    const result = tx
      .insert(watchHistory)
      .values({
        mediaType: input.mediaType,
        mediaId: input.mediaId,
        watchedAt,
        completed,
      })
      .onConflictDoNothing()
      .run();

    if (result.changes === 0) {
      const existing = tx
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
      let compMediaType: string = input.mediaType;
      let compMediaId = input.mediaId;

      if (input.mediaType === 'episode') {
        const ep = tx
          .select({ seasonId: episodes.seasonId })
          .from(episodes)
          .where(eq(episodes.id, input.mediaId))
          .get();
        if (ep) {
          const season = tx
            .select({ tvShowId: seasons.tvShowId })
            .from(seasons)
            .where(eq(seasons.id, ep.seasonId))
            .get();
          if (season) {
            compMediaType = 'tv_show';
            compMediaId = season.tvShowId;
          }
        }
      }

      resetStaleness(compMediaType, compMediaId);
      createDebriefSession(entry.id);
      queueDebriefStatus(compMediaType, compMediaId);
    }

    let watchlistRemoved = false;
    if (completed === 1 && input.source !== 'plex_sync') {
      if (input.mediaType === 'movie') {
        const deleteResult = tx
          .delete(mediaWatchlist)
          .where(
            and(eq(mediaWatchlist.mediaType, 'movie'), eq(mediaWatchlist.mediaId, input.mediaId))
          )
          .run();
        watchlistRemoved = deleteResult.changes > 0;
      } else if (input.mediaType === 'episode') {
        watchlistRemoved = autoRemoveTvShowIfFullyWatched(tx, input.mediaId);
      }
      if (watchlistRemoved) {
        resequencePriorities(tx);
      }
    }

    return { entry, created: true, watchlistRemoved };
  });
}

export function autoRemoveTvShowIfFullyWatched(
  tx: Parameters<Parameters<ReturnType<typeof getDrizzle>['transaction']>[0]>[0],
  episodeId: number
): boolean {
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
