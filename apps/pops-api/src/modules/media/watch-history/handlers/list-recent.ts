import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { episodes, movies, seasons, tvShows, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';

import type {
  RecentWatchHistoryEntry,
  RecentWatchHistoryFilters,
  WatchHistoryRow,
} from '../types.js';

export interface RecentWatchHistoryListResult {
  rows: RecentWatchHistoryEntry[];
  total: number;
}

function buildWhereClause(filters: RecentWatchHistoryFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.mediaType) {
    conditions.push(eq(watchHistory.mediaType, filters.mediaType as 'movie' | 'episode'));
  }
  if (filters.startDate) conditions.push(gte(watchHistory.watchedAt, filters.startDate));
  if (filters.endDate) conditions.push(lte(watchHistory.watchedAt, filters.endDate));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

interface MovieRow {
  title: string;
  posterPath: string | null;
  tmdbId: number;
  posterOverridePath: string | null;
}

function moviePosterUrl(movie: MovieRow | undefined): string | null {
  if (movie?.posterOverridePath) return movie.posterOverridePath;
  if (movie?.posterPath) return `/media/images/movie/${movie.tmdbId}/poster.jpg`;
  return null;
}

function buildMovieEntry(row: WatchHistoryRow): RecentWatchHistoryEntry {
  const db = getDrizzle();
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
  return {
    id: row.id,
    mediaType: row.mediaType,
    mediaId: row.mediaId,
    watchedAt: row.watchedAt,
    completed: row.completed,
    title: movie?.title ?? null,
    posterPath: movie?.posterPath ?? null,
    posterUrl: moviePosterUrl(movie),
    seasonNumber: null,
    episodeNumber: null,
    showName: null,
    tvShowId: null,
  };
}

function emptyEpisodeEntry(row: WatchHistoryRow): RecentWatchHistoryEntry {
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

interface ShowRow {
  name: string;
  posterPath: string | null;
  tvdbId: number;
  posterOverridePath: string | null;
}

function showPosterUrl(show: ShowRow | undefined | null): string | null {
  if (show?.posterOverridePath) return show.posterOverridePath;
  if (show?.posterPath) return `/media/images/tv/${show.tvdbId}/poster.jpg`;
  return null;
}

interface EpisodeContext {
  episode: {
    name: string | null;
    episodeNumber: number;
    seasonId: number;
    stillPath: string | null;
  };
  season: { tvShowId: number; seasonNumber: number } | undefined;
  show: ShowRow | undefined | null;
}

function loadEpisodeContext(episodeId: number): EpisodeContext | null {
  const db = getDrizzle();
  const episode = db
    .select({
      name: episodes.name,
      episodeNumber: episodes.episodeNumber,
      seasonId: episodes.seasonId,
      stillPath: episodes.stillPath,
    })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .get();
  if (!episode) return null;

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
  return { episode, season, show };
}

function buildEpisodeEntry(row: WatchHistoryRow): RecentWatchHistoryEntry {
  const ctx = loadEpisodeContext(row.mediaId);
  if (!ctx) return emptyEpisodeEntry(row);
  const { episode, season, show } = ctx;
  return {
    id: row.id,
    mediaType: row.mediaType,
    mediaId: row.mediaId,
    watchedAt: row.watchedAt,
    completed: row.completed,
    title: episode.name ?? null,
    posterPath: show?.posterPath ?? episode.stillPath ?? null,
    posterUrl: showPosterUrl(show),
    seasonNumber: season?.seasonNumber ?? null,
    episodeNumber: episode.episodeNumber,
    showName: show?.name ?? null,
    tvShowId: season?.tvShowId ?? null,
  };
}

function rowToEntry(row: WatchHistoryRow): RecentWatchHistoryEntry {
  if (row.mediaType === 'movie') return buildMovieEntry(row);
  return buildEpisodeEntry(row);
}

export function listRecent(
  filters: RecentWatchHistoryFilters,
  limit: number,
  offset: number
): RecentWatchHistoryListResult {
  const db = getDrizzle();
  const where = buildWhereClause(filters);

  const rawRows = db
    .select()
    .from(watchHistory)
    .where(where)
    .orderBy(desc(watchHistory.watchedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const [countRow] = db.select({ total: count() }).from(watchHistory).where(where).all();

  return {
    rows: rawRows.map(rowToEntry),
    total: countRow?.total ?? 0,
  };
}
