import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  type SQL,
} from 'drizzle-orm';

/**
 * Watch history service — CRUD operations against SQLite via Drizzle ORM.
 *
 * Auto-remove from watchlist (PRD-011 R6):
 *   - Movie: removed from watchlist when marked as watched.
 *   - Episode: TV show removed from watchlist when all episodes are watched.
 */
import { episodes, mediaWatchlist, movies, seasons, tvShows, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';
import { resetStaleness } from '../comparisons/staleness.js';
import { createDebriefSession, queueDebriefStatus } from '../debrief/service.js';
import { resequencePriorities } from '../watchlist/service.js';

import type {
  BatchLogWatchInput,
  BatchProgressEntry,
  LogWatchInput,
  NextEpisode,
  RecentWatchHistoryEntry,
  RecentWatchHistoryFilters,
  SeasonProgress,
  TvShowProgress,
  WatchHistoryFilters,
  WatchHistoryRow,
} from './types.js';

/** Count + rows for a paginated list. */
export interface WatchHistoryListResult {
  rows: WatchHistoryRow[];
  total: number;
}

/** List watch history entries with optional filters. */
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

/** Count + enriched rows for a paginated recent history list. */
export interface RecentWatchHistoryListResult {
  rows: RecentWatchHistoryEntry[];
  total: number;
}

/**
 * List recent watch history entries with date range and mediaType filters.
 * Joins media metadata (title, poster) for display on the history page.
 */
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

  // Get raw watch history rows first
  const rawRows = db
    .select()
    .from(watchHistory)
    .where(where)
    .orderBy(desc(watchHistory.watchedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const [countRow] = db.select({ total: count() }).from(watchHistory).where(where).all();

  // Enrich with media metadata
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
    // episode — look up episode → season → tv show
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

/** Get a single watch history entry by id. Throws NotFoundError if missing. */
export function getWatchHistoryEntry(id: number): WatchHistoryRow {
  const db = getDrizzle();
  const row = db.select().from(watchHistory).where(eq(watchHistory.id, id)).get();

  if (!row) throw new NotFoundError('WatchHistoryEntry', String(id));
  return row;
}

/** Result of logWatch including whether a watchlist entry was removed. */
export interface LogWatchResult {
  entry: WatchHistoryRow;
  /** True if a new row was inserted, false if it already existed (duplicate). */
  created: boolean;
  watchlistRemoved: boolean;
}

/**
 * Log a watch event. Returns the created row and whether a watchlist
 * entry was auto-removed.
 *
 * Side effects (PRD-011 R6 — auto-remove from watchlist):
 *   - If mediaType is "movie" and completed === 1, removes the movie
 *     from the watchlist (if present).
 *   - If mediaType is "episode" and completed === 1, checks whether all
 *     episodes of the parent TV show are now watched, and if so removes
 *     the TV show from the watchlist.
 *
 * Insert and auto-remove run inside a single transaction.
 */
export function logWatch(input: LogWatchInput): LogWatchResult {
  const db = getDrizzle();
  const completed = input.completed ?? 1;
  const watchedAt = input.watchedAt ?? new Date().toISOString();

  return db.transaction((tx) => {
    // Skip if a blacklisted entry exists for this exact (media_type, media_id, watched_at)
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

    // If duplicate, return the existing row
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

    // Reset staleness + queue debrief when a completed watch event is logged
    // (comparisons use movie/tv_show types, so resolve episode → tv_show)
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

      // Auto-queue debrief session for completed watches (PRD-063)
      createDebriefSession(entry.id);

      // Queue per-dimension debrief status rows
      queueDebriefStatus(compMediaType, compMediaId);
    }

    // Auto-remove from watchlist (PRD-011 R6) — skip for plex_sync source
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

/**
 * Check if the TV show owning the given episode is fully watched.
 * If all episodes across all seasons have completed watch_history entries,
 * remove the show from the watchlist.
 *
 * Uses a single JOIN query to count watched episodes (no N+1).
 */
function autoRemoveTvShowIfFullyWatched(
  tx: Parameters<Parameters<ReturnType<typeof getDrizzle>['transaction']>[0]>[0],
  episodeId: number
): boolean {
  // Look up episode → season → tv show
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

  // Get all episode IDs for this show
  const showEpisodeIds = tx
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .all()
    .map((r) => r.id);

  if (showEpisodeIds.length === 0) return false;

  // Count distinct watched episodes for this show in a single query
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

/**
 * Get watch progress for a TV show — watched/total episode counts per season and overall.
 * Uses countDistinct to avoid double-counting rewatches.
 * Throws NotFoundError if the TV show doesn't exist.
 */
export function getProgress(tvShowId: number): TvShowProgress {
  const db = getDrizzle();

  // Verify TV show exists
  const show = db.select({ id: tvShows.id }).from(tvShows).where(eq(tvShows.id, tvShowId)).get();
  if (!show) throw new NotFoundError('TvShow', String(tvShowId));

  // Get all seasons with their episode counts
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

  // Get watched episode counts per season
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

  // Find next unwatched episode
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
  // Get all episodes for this show, ordered by season then episode
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

  // Get set of watched episode IDs
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

  // Find first unwatched
  for (const ep of allEpisodes) {
    if (!watchedIds.has(ep.episodeId)) {
      return {
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        episodeName: ep.episodeName,
      };
    }
  }

  return null; // All watched
}

/** Result of a batch log operation. */
export interface BatchLogResult {
  logged: number;
  skipped: number;
}

/**
 * Batch-log watch events for all episodes in a season or all episodes in a show.
 *
 * - mediaType "season": logs all episodes in the given season.
 * - mediaType "show": logs all episodes across all seasons of the given show.
 *
 * Skips episodes that already have a completed watch history entry.
 * Triggers auto-remove from watchlist when all episodes are watched.
 * Runs in a single transaction for atomicity.
 */
export function batchLogWatch(input: BatchLogWatchInput): BatchLogResult {
  const db = getDrizzle();
  const completed = input.completed ?? 1;
  const watchedAt = input.watchedAt ?? new Date().toISOString();

  return db.transaction((tx) => {
    // Resolve episode IDs based on mediaType, excluding future unaired episodes
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
      // "show" — get all episodes across all seasons
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

    // Find already-watched episodes (completed = 1) to skip
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

    // Find blacklisted episodes at this exact timestamp to skip
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

    // Insert watch history entries for episodes not yet watched and not blacklisted
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

    // Auto-remove from watchlist if all episodes now watched
    if (completed === 1 && toLog.length > 0) {
      // Determine the TV show ID for watchlist removal + staleness reset
      let tvShowId: number | undefined;

      if (input.mediaType === 'show') {
        tvShowId = input.mediaId;
      } else {
        // season → look up the show
        const season = tx
          .select({ tvShowId: seasons.tvShowId })
          .from(seasons)
          .where(eq(seasons.id, input.mediaId))
          .get();
        tvShowId = season?.tvShowId;
      }

      // Reset staleness for the parent TV show (comparisons use tv_show type)
      if (tvShowId !== undefined) {
        resetStaleness('tv_show', tvShowId);
      }

      if (tvShowId !== undefined) {
        // Check if ALL episodes of the show are now watched
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

/**
 * Get watch progress percentages for multiple TV shows in a single query.
 * Returns only the overall percentage per show (lightweight for grid views).
 */
export function getBatchProgress(tvShowIds: number[]): BatchProgressEntry[] {
  if (tvShowIds.length === 0) return [];

  const db = getDrizzle();

  // Get total episode counts per show
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

  // Get watched episode counts per show
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

/** Delete a watch history entry by ID. Throws NotFoundError if missing. */
export function deleteWatchHistoryEntry(id: number): void {
  getWatchHistoryEntry(id);

  const result = getDrizzle().delete(watchHistory).where(eq(watchHistory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('WatchHistoryEntry', String(id));
}
