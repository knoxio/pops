/**
 * Watch history service — CRUD operations against SQLite via Drizzle ORM.
 */
import { count, desc, eq, and, type SQL } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { watchHistory } from "@pops/db-types";
import { NotFoundError } from "../../../shared/errors.js";
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

  return getWatchHistoryEntry(Number(result.lastInsertRowid));
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
