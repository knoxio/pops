/**
 * Watch history service — CRUD operations against SQLite via Drizzle ORM.
 *
 * Auto-remove from watchlist (PRD-011 R6):
 *   - Movie: removed from watchlist when marked as watched.
 *   - Episode: TV show removed from watchlist when all episodes are watched.
 */
import { count, countDistinct, desc, eq, and, inArray, type SQL } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { watchHistory, mediaWatchlist, episodes, seasons } from "@pops/db-types";
import { NotFoundError } from "../../../shared/errors.js";
import type {
  WatchHistoryRow,
  LogWatchInput,
  WatchHistoryFilters,
  TvShowProgress,
  SeasonProgress,
} from "./types.js";
import { tvShows } from "@pops/db-types";

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
    conditions.push(eq(watchHistory.mediaType, filters.mediaType as "movie" | "episode"));
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

  return { rows, total: countRow.total };
}

/** Get a single watch history entry by id. Throws NotFoundError if missing. */
export function getWatchHistoryEntry(id: number): WatchHistoryRow {
  const db = getDrizzle();
  const row = db.select().from(watchHistory).where(eq(watchHistory.id, id)).get();

  if (!row) throw new NotFoundError("WatchHistoryEntry", String(id));
  return row;
}

/**
 * Log a watch event. Returns the created row.
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
export function logWatch(input: LogWatchInput): WatchHistoryRow {
  const db = getDrizzle();
  const completed = input.completed ?? 1;

  return db.transaction((tx) => {
    const result = tx
      .insert(watchHistory)
      .values({
        mediaType: input.mediaType,
        mediaId: input.mediaId,
        watchedAt: input.watchedAt ?? new Date().toISOString(),
        completed,
      })
      .run();

    const entry = tx
      .select()
      .from(watchHistory)
      .where(eq(watchHistory.id, Number(result.lastInsertRowid)))
      .get();
    if (!entry) throw new Error("Watch history entry not found after insert");

    // Auto-remove from watchlist (PRD-011 R6)
    if (completed === 1) {
      if (input.mediaType === "movie") {
        tx.delete(mediaWatchlist)
          .where(
            and(eq(mediaWatchlist.mediaType, "movie"), eq(mediaWatchlist.mediaId, input.mediaId))
          )
          .run();
      } else if (input.mediaType === "episode") {
        autoRemoveTvShowIfFullyWatched(tx, input.mediaId);
      }
    }

    return entry;
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
  tx: Parameters<Parameters<ReturnType<typeof getDrizzle>["transaction"]>[0]>[0],
  episodeId: number
): void {
  // Look up episode → season → tv show
  const episode = tx
    .select({ seasonId: episodes.seasonId })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .get();
  if (!episode) return;

  const season = tx
    .select({ tvShowId: seasons.tvShowId })
    .from(seasons)
    .where(eq(seasons.id, episode.seasonId))
    .get();
  if (!season) return;

  const tvShowId = season.tvShowId;

  // Get all episode IDs for this show
  const showEpisodeIds = tx
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .all()
    .map((r) => r.id);

  if (showEpisodeIds.length === 0) return;

  // Count distinct watched episodes for this show in a single query
  const [{ watched }] = tx
    .select({ watched: countDistinct(watchHistory.mediaId) })
    .from(watchHistory)
    .where(
      and(
        eq(watchHistory.mediaType, "episode"),
        eq(watchHistory.completed, 1),
        inArray(watchHistory.mediaId, showEpisodeIds)
      )
    )
    .all();

  if (watched >= showEpisodeIds.length) {
    tx.delete(mediaWatchlist)
      .where(and(eq(mediaWatchlist.mediaType, "tv_show"), eq(mediaWatchlist.mediaId, tvShowId)))
      .run();
  }
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
  if (!show) throw new NotFoundError("TvShow", String(tvShowId));

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
        eq(watchHistory.mediaType, "episode"),
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
  };
}

/** Delete a watch history entry by ID. Throws NotFoundError if missing. */
export function deleteWatchHistoryEntry(id: number): void {
  getWatchHistoryEntry(id);

  const result = getDrizzle().delete(watchHistory).where(eq(watchHistory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError("WatchHistoryEntry", String(id));
}
