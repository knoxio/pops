/**
 * `listRecent` — recent watch history enriched with media metadata for the
 * history page. Lifted verbatim from the monolith
 * `watch-history/handlers/list-recent.ts` and converted to the pillar's
 * `(db, …)` arg-passing pattern.
 *
 * Enrichment is per-row (N+1 by design — the monolith did the same): a movie
 * row looks up `movies`; an episode row resolves episode → season → tv_show.
 * `posterUrl` resolves to the override path or the pillar's `/media/images`
 * byte route keyed by the external (tmdb/tvdb) id, never the DB id.
 */
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { episodes, movies, seasons, tvShows, watchHistory } from '../schema.js';

import type { MediaDb } from './internal.js';
import type { WatchHistoryRow } from './watch-history.js';

/** Filters accepted by {@link listRecent}. */
export interface RecentWatchHistoryFilters {
  mediaType?: 'movie' | 'episode' | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

/** Enriched watch history entry with media metadata for the history page. */
export interface RecentWatchHistoryEntry {
  id: number;
  mediaType: string;
  mediaId: number;
  watchedAt: string;
  completed: number;
  title: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  showName: string | null;
  tvShowId: number | null;
}

/** Count + enriched rows for a paginated recent-history list. */
export interface RecentWatchHistoryListResult {
  rows: RecentWatchHistoryEntry[];
  total: number;
}

function buildWhereClause(filters: RecentWatchHistoryFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.mediaType) conditions.push(eq(watchHistory.mediaType, filters.mediaType));
  if (filters.startDate) conditions.push(gte(watchHistory.watchedAt, filters.startDate));
  if (filters.endDate) conditions.push(lte(watchHistory.watchedAt, filters.endDate));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

interface MovieMeta {
  title: string;
  posterPath: string | null;
  tmdbId: number;
  posterOverridePath: string | null;
}

function moviePosterUrl(movie: MovieMeta | undefined): string | null {
  if (movie?.posterOverridePath) return movie.posterOverridePath;
  if (movie?.posterPath) return `/media/images/movie/${movie.tmdbId}/poster.jpg`;
  return null;
}

function buildMovieEntry(db: MediaDb, row: WatchHistoryRow): RecentWatchHistoryEntry {
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

interface ShowMeta {
  name: string;
  posterPath: string | null;
  tvdbId: number;
  posterOverridePath: string | null;
}

function showPosterUrl(show: ShowMeta | undefined | null): string | null {
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
  show: ShowMeta | undefined | null;
}

function loadEpisodeContext(db: MediaDb, episodeId: number): EpisodeContext | null {
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

function buildEpisodeEntry(db: MediaDb, row: WatchHistoryRow): RecentWatchHistoryEntry {
  const ctx = loadEpisodeContext(db, row.mediaId);
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

function rowToEntry(db: MediaDb, row: WatchHistoryRow): RecentWatchHistoryEntry {
  if (row.mediaType === 'movie') return buildMovieEntry(db, row);
  return buildEpisodeEntry(db, row);
}

/** Recent watch history with date-range filters, enriched per row. */
export function listRecent(
  db: MediaDb,
  filters: RecentWatchHistoryFilters,
  limit: number,
  offset: number
): RecentWatchHistoryListResult {
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

  return { rows: rawRows.map((row) => rowToEntry(db, row)), total: countRow?.total ?? 0 };
}
