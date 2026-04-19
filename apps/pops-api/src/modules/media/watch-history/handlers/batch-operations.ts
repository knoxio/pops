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

export function batchLogWatch(input: BatchLogWatchInput): BatchLogResult {
  const db = getDrizzle();
  const completed = input.completed ?? 1;
  const watchedAt = input.watchedAt ?? new Date().toISOString();

  return db.transaction((tx) => {
    let episodeIds: number[];
    const today = new Date().toISOString().slice(0, 10);
    const airedFilter = and(isNotNull(episodes.airDate), lte(episodes.airDate, today));

    if (input.mediaType === 'season') {
      episodeIds = tx
        .select({ id: episodes.id })
        .from(episodes)
        .where(and(eq(episodes.seasonId, input.mediaId), airedFilter))
        .all()
        .map((r) => r.id);
    } else {
      episodeIds = tx
        .select({ id: episodes.id })
        .from(episodes)
        .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
        .where(and(eq(seasons.tvShowId, input.mediaId), airedFilter))
        .all()
        .map((r) => r.id);
    }

    if (episodeIds.length === 0) {
      return { logged: 0, skipped: 0 };
    }

    const alreadyWatched =
      completed === 1
        ? new Set(
            tx
              .select({ mediaId: watchHistory.mediaId })
              .from(watchHistory)
              .where(
                and(
                  eq(watchHistory.mediaType, 'episode'),
                  eq(watchHistory.completed, 1),
                  inArray(watchHistory.mediaId, episodeIds)
                )
              )
              .all()
              .map((r) => r.mediaId)
          )
        : new Set<number>();

    const blacklistedIds = new Set(
      tx
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
        .all()
        .map((r) => r.mediaId)
    );

    const toLog = episodeIds.filter((id) => !alreadyWatched.has(id) && !blacklistedIds.has(id));

    for (const episodeId of toLog) {
      tx.insert(watchHistory)
        .values({
          mediaType: 'episode',
          mediaId: episodeId,
          watchedAt,
          completed,
        })
        .onConflictDoNothing()
        .run();
    }

    if (completed === 1 && toLog.length > 0) {
      let tvShowId: number | undefined;

      if (input.mediaType === 'show') {
        tvShowId = input.mediaId;
      } else {
        const season = tx
          .select({ tvShowId: seasons.tvShowId })
          .from(seasons)
          .where(eq(seasons.id, input.mediaId))
          .get();
        tvShowId = season?.tvShowId;
      }

      if (tvShowId !== undefined) {
        resetStaleness('tv_show', tvShowId);
      }

      if (tvShowId !== undefined) {
        const allShowEpisodeIds = tx
          .select({ id: episodes.id })
          .from(episodes)
          .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
          .where(eq(seasons.tvShowId, tvShowId))
          .all()
          .map((r) => r.id);

        if (allShowEpisodeIds.length > 0) {
          const watchedRow2 = tx
            .select({ watched: countDistinct(watchHistory.mediaId) })
            .from(watchHistory)
            .where(
              and(
                eq(watchHistory.mediaType, 'episode'),
                eq(watchHistory.completed, 1),
                inArray(watchHistory.mediaId, allShowEpisodeIds)
              )
            )
            .all()[0];
          const watched = watchedRow2?.watched ?? 0;

          if (watched >= allShowEpisodeIds.length) {
            const removeResult = tx
              .delete(mediaWatchlist)
              .where(
                and(eq(mediaWatchlist.mediaType, 'tv_show'), eq(mediaWatchlist.mediaId, tvShowId))
              )
              .run();
            if (removeResult.changes > 0) {
              resequencePriorities(tx);
            }
          }
        }
      }
    }

    return { logged: toLog.length, skipped: episodeIds.length - toLog.length };
  });
}
