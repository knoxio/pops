/**
 * Watch history service — CRUD operations against SQLite via Drizzle ORM.
 *
 * Auto-remove from watchlist (PRD-011 R6):
 *   - Movie: removed from watchlist when marked as watched.
 *   - Episode: TV show removed from watchlist when all episodes are watched.
 */
import { count, desc, eq, and, type SQL } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { watchHistory, episodes, seasons } from "@pops/db-types";
import { NotFoundError } from "../../../shared/errors.js";
import { removeByMedia } from "../watchlist/service.js";
import type {
  WatchHistoryRow,
  LogWatchInput,
  WatchHistoryFilters,
} from "./types.js";

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

  const [countRow] = db
    .select({ total: count() })
    .from(watchHistory)
    .where(where)
    .all();

  return { rows, total: countRow.total };
}

/** Get a single watch history entry by id. Throws NotFoundError if missing. */
export function getWatchHistoryEntry(id: number): WatchHistoryRow {
  const db = getDrizzle();
  const row = db
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.id, id))
    .get();

  if (!row) throw new NotFoundError("WatchHistoryEntry", String(id));
  return row;
}

/** Log a watch event. Returns the created row. */
export function logWatch(input: LogWatchInput): WatchHistoryRow {
  const db = getDrizzle();

  const result = db
    .insert(watchHistory)
    .values({
      mediaType: input.mediaType,
      mediaId: input.mediaId,
      watchedAt: input.watchedAt ?? new Date().toISOString(),
      completed: input.completed ?? 1,
    })
    .run();

  const entry = getWatchHistoryEntry(Number(result.lastInsertRowid));

  // Auto-remove from watchlist (PRD-011 R6)
  const completed = input.completed ?? 1;
  if (completed) {
    if (input.mediaType === "movie") {
      removeByMedia("movie", input.mediaId);
    } else if (input.mediaType === "episode") {
      autoRemoveTvShowIfFullyWatched(input.mediaId);
    }
  }

  return entry;
}

/**
 * Check if the TV show owning the given episode is fully watched.
 * If all episodes across all seasons are in watch_history, remove
 * the show from the watchlist.
 */
function autoRemoveTvShowIfFullyWatched(episodeId: number): void {
  const db = getDrizzle();

  // Look up episode → season → tv show
  const episode = db
    .select({ seasonId: episodes.seasonId })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .get();
  if (!episode) return;

  const season = db
    .select({ tvShowId: seasons.tvShowId })
    .from(seasons)
    .where(eq(seasons.id, episode.seasonId))
    .get();
  if (!season) return;

  const tvShowId = season.tvShowId;

  // Get all episode IDs for this show
  const showEpisodeIds = db
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.tvShowId, tvShowId))
    .all()
    .map((r) => r.id);

  if (showEpisodeIds.length === 0) return;

  // Count how many of this show's episodes have completed watch entries
  let watchedCount = 0;
  for (const epId of showEpisodeIds) {
    const entry = db
      .select({ id: watchHistory.id })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.mediaType, "episode"),
          eq(watchHistory.mediaId, epId),
          eq(watchHistory.completed, 1),
        ),
      )
      .get();
    if (entry) watchedCount++;
  }

  if (watchedCount >= showEpisodeIds.length) {
    removeByMedia("tv_show", tvShowId);
  }
}

/** Delete a watch history entry by ID. Throws NotFoundError if missing. */
export function deleteWatchHistoryEntry(id: number): void {
  getWatchHistoryEntry(id);

  const result = getDrizzle()
    .delete(watchHistory)
    .where(eq(watchHistory.id, id))
    .run();
  if (result.changes === 0) throw new NotFoundError("WatchHistoryEntry", String(id));
}
