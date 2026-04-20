import { and, count, countDistinct, eq, inArray } from 'drizzle-orm';

import { episodes, seasons, tvShows, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { NotFoundError } from '../../../../shared/errors.js';

import type { BatchProgressEntry, NextEpisode, SeasonProgress, TvShowProgress } from '../types.js';

function findNextUnwatchedEpisode(
  db: ReturnType<typeof getDrizzle>,
  tvShowId: number
): NextEpisode | null {
  const allEpisodes = db
    .select({
      episodeId: episodes.id,
      seasonNumber: seasons.seasonNumber,
      episodeNumber: episodes.episodeNumber,
      episodeName: episodes.name,
    })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .orderBy(seasons.seasonNumber, episodes.episodeNumber)
    .all();
  if (allEpisodes.length === 0) return null;

  const watchedIds = new Set(
    db
      .select({ mediaId: watchHistory.mediaId })
      .from(watchHistory)
      .innerJoin(episodes, eq(episodes.id, watchHistory.mediaId))
      .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
      .where(
        and(
          eq(watchHistory.mediaType, 'episode'),
          eq(watchHistory.completed, 1),
          eq(seasons.tvShowId, tvShowId)
        )
      )
      .all()
      .map((r) => r.mediaId)
  );

  for (const ep of allEpisodes) {
    if (!watchedIds.has(ep.episodeId)) {
      return {
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        episodeName: ep.episodeName,
      };
    }
  }
  return null;
}

export function getProgress(tvShowId: number): TvShowProgress {
  const db = getDrizzle();
  const show = db.select({ id: tvShows.id }).from(tvShows).where(eq(tvShows.id, tvShowId)).get();
  if (!show) throw new NotFoundError('TvShow', String(tvShowId));

  const seasonRows = db
    .select({
      seasonId: seasons.id,
      seasonNumber: seasons.seasonNumber,
      total: count(episodes.id),
    })
    .from(seasons)
    .leftJoin(episodes, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .groupBy(seasons.id)
    .orderBy(seasons.seasonNumber)
    .all();

  const watchedRows = db
    .select({
      seasonId: seasons.id,
      watched: countDistinct(watchHistory.mediaId),
    })
    .from(watchHistory)
    .innerJoin(episodes, eq(episodes.id, watchHistory.mediaId))
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(
      and(
        eq(watchHistory.mediaType, 'episode'),
        eq(watchHistory.completed, 1),
        eq(seasons.tvShowId, tvShowId)
      )
    )
    .groupBy(seasons.id)
    .all();

  const watchedBySeason = new Map(watchedRows.map((r) => [r.seasonId, r.watched]));

  const seasonProgress: SeasonProgress[] = seasonRows.map((s) => {
    const watched = watchedBySeason.get(s.seasonId) ?? 0;
    return {
      seasonId: s.seasonId,
      seasonNumber: s.seasonNumber,
      watched,
      total: s.total,
      percentage: s.total > 0 ? Math.round((watched / s.total) * 100) : 0,
    };
  });

  const totalWatched = seasonProgress.reduce((sum, s) => sum + s.watched, 0);
  const totalEpisodes = seasonProgress.reduce((sum, s) => sum + s.total, 0);

  return {
    tvShowId,
    overall: {
      watched: totalWatched,
      total: totalEpisodes,
      percentage: totalEpisodes > 0 ? Math.round((totalWatched / totalEpisodes) * 100) : 0,
    },
    seasons: seasonProgress,
    nextEpisode: findNextUnwatchedEpisode(db, tvShowId),
  };
}

export function getBatchProgress(tvShowIds: number[]): BatchProgressEntry[] {
  if (tvShowIds.length === 0) return [];
  const db = getDrizzle();

  const totalRows = db
    .select({
      tvShowId: seasons.tvShowId,
      total: count(episodes.id),
    })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(inArray(seasons.tvShowId, tvShowIds))
    .groupBy(seasons.tvShowId)
    .all();

  const watchedRows = db
    .select({
      tvShowId: seasons.tvShowId,
      watched: countDistinct(watchHistory.mediaId),
    })
    .from(watchHistory)
    .innerJoin(episodes, eq(episodes.id, watchHistory.mediaId))
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(
      and(
        eq(watchHistory.mediaType, 'episode'),
        eq(watchHistory.completed, 1),
        inArray(seasons.tvShowId, tvShowIds)
      )
    )
    .groupBy(seasons.tvShowId)
    .all();

  const watchedMap = new Map(watchedRows.map((r) => [r.tvShowId, r.watched]));
  return totalRows.map((row) => {
    const watched = watchedMap.get(row.tvShowId) ?? 0;
    return {
      tvShowId: row.tvShowId,
      percentage: row.total > 0 ? Math.round((watched / row.total) * 100) : 0,
    };
  });
}
