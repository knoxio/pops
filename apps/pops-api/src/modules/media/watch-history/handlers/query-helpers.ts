import { and, count, countDistinct, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';

import { episodes, movies, seasons, tvShows, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { NotFoundError } from '../../../../shared/errors.js';

import type {
  BatchProgressEntry,
  NextEpisode,
  RecentWatchHistoryEntry,
  RecentWatchHistoryFilters,
  SeasonProgress,
  TvShowProgress,
  WatchHistoryFilters,
  WatchHistoryRow,
} from '../types.js';

export interface WatchHistoryListResult {
  rows: WatchHistoryRow[];
  total: number;
}

export interface RecentWatchHistoryListResult {
  rows: RecentWatchHistoryEntry[];
  total: number;
}

export function listWatchHistory(
  filters: WatchHistoryFilters,
  limit: number,
  offset: number
): WatchHistoryListResult {
  const db = getDrizzle();
  const conditions: SQL[] = [];

  if (filters.mediaType) {
    conditions.push(eq(watchHistory.mediaType, filters.mediaType as 'movie' | 'episode'));
  }
  if (filters.mediaId) {
    conditions.push(eq(watchHistory.mediaId, filters.mediaId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(watchHistory)
    .where(where)
    .orderBy(desc(watchHistory.watchedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const [countRow] = db.select({ total: count() }).from(watchHistory).where(where).all();

  return { rows, total: countRow?.total ?? 0 };
}

export function listRecent(
  filters: RecentWatchHistoryFilters,
  limit: number,
  offset: number
): RecentWatchHistoryListResult {
  const db = getDrizzle();
  const conditions: SQL[] = [];

  if (filters.mediaType) {
    conditions.push(eq(watchHistory.mediaType, filters.mediaType as 'movie' | 'episode'));
  }
  if (filters.startDate) {
    conditions.push(gte(watchHistory.watchedAt, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(watchHistory.watchedAt, filters.endDate));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rawRows = db
    .select()
    .from(watchHistory)
    .where(where)
    .orderBy(desc(watchHistory.watchedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const [countRow] = db.select({ total: count() }).from(watchHistory).where(where).all();

  const rows: RecentWatchHistoryEntry[] = rawRows.map((row) => {
    if (row.mediaType === 'movie') {
      const movie = db
        .select({
          title: movies.title,
          posterPath: movies.posterPath,
          tmdbId: movies.tmdbId,
          posterOverridePath: movies.posterOverridePath,
        })
        .from(movies)
        .where(eq(movies.id, row.mediaId))
        .get();
      let posterUrl: string | null = null;
      if (movie?.posterOverridePath) posterUrl = movie.posterOverridePath;
      else if (movie?.posterPath) posterUrl = `/media/images/movie/${movie.tmdbId}/poster.jpg`;
      return {
        id: row.id,
        mediaType: row.mediaType,
        mediaId: row.mediaId,
        watchedAt: row.watchedAt,
        completed: row.completed,
        title: movie?.title ?? null,
        posterPath: movie?.posterPath ?? null,
        posterUrl,
        seasonNumber: null,
        episodeNumber: null,
        showName: null,
        tvShowId: null,
      };
    }

    const episode = db
      .select({
        name: episodes.name,
        episodeNumber: episodes.episodeNumber,
        seasonId: episodes.seasonId,
        stillPath: episodes.stillPath,
      })
      .from(episodes)
      .where(eq(episodes.id, row.mediaId))
      .get();

    if (!episode) {
      return {
        id: row.id,
        mediaType: row.mediaType,
        mediaId: row.mediaId,
        watchedAt: row.watchedAt,
        completed: row.completed,
        title: null,
        posterPath: null,
        posterUrl: null,
        seasonNumber: null,
        episodeNumber: null,
        showName: null,
        tvShowId: null,
      };
    }

    const season = db
      .select({ tvShowId: seasons.tvShowId, seasonNumber: seasons.seasonNumber })
      .from(seasons)
      .where(eq(seasons.id, episode.seasonId))
      .get();

    const show = season
      ? db
          .select({
            name: tvShows.name,
            posterPath: tvShows.posterPath,
            tvdbId: tvShows.tvdbId,
            posterOverridePath: tvShows.posterOverridePath,
          })
          .from(tvShows)
          .where(eq(tvShows.id, season.tvShowId))
          .get()
      : null;

    let posterUrl: string | null = null;
    if (show?.posterOverridePath) posterUrl = show.posterOverridePath;
    else if (show?.posterPath) posterUrl = `/media/images/tv/${show.tvdbId}/poster.jpg`;

    return {
      id: row.id,
      mediaType: row.mediaType,
      mediaId: row.mediaId,
      watchedAt: row.watchedAt,
      completed: row.completed,
      title: episode.name ?? null,
      posterPath: show?.posterPath ?? episode.stillPath ?? null,
      posterUrl,
      seasonNumber: season?.seasonNumber ?? null,
      episodeNumber: episode.episodeNumber,
      showName: show?.name ?? null,
      tvShowId: season?.tvShowId ?? null,
    };
  });

  return { rows, total: countRow?.total ?? 0 };
}

export function getWatchHistoryEntry(id: number): WatchHistoryRow {
  const db = getDrizzle();
  const row = db.select().from(watchHistory).where(eq(watchHistory.id, id)).get();
  if (!row) throw new NotFoundError('WatchHistoryEntry', String(id));
  return row;
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

  const nextEpisode = findNextUnwatchedEpisode(db, tvShowId);

  return {
    tvShowId,
    overall: {
      watched: totalWatched,
      total: totalEpisodes,
      percentage: totalEpisodes > 0 ? Math.round((totalWatched / totalEpisodes) * 100) : 0,
    },
    seasons: seasonProgress,
    nextEpisode,
  };
}

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

export function deleteWatchHistoryEntry(id: number): void {
  getWatchHistoryEntry(id);
  const result = getDrizzle().delete(watchHistory).where(eq(watchHistory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('WatchHistoryEntry', String(id));
}
