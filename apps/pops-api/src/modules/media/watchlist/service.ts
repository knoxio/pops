/**
 * Watchlist service — CRUD operations against SQLite via Drizzle ORM.
 */
import { asc, count, desc, eq, and, type SQL } from "drizzle-orm";
import { getDb, getDrizzle } from "../../../db.js";
import { mediaWatchlist } from "@pops/db-types";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import type {
  MediaWatchlistRow,
  AddToWatchlistInput,
  UpdateWatchlistInput,
  WatchlistFilters,
} from "./types.js";

/** Count + rows for a paginated list. */
export interface WatchlistListResult {
  rows: MediaWatchlistRow[];
  total: number;
}

/** List watchlist entries with optional filters. */
export function listWatchlist(
  filters: WatchlistFilters,
  limit: number,
  offset: number
): WatchlistListResult {
  const db = getDrizzle();
  const conditions: SQL[] = [];

  if (filters.mediaType) {
    conditions.push(eq(mediaWatchlist.mediaType, filters.mediaType as "movie" | "tv_show"));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(mediaWatchlist)
    .where(where)
    .orderBy(asc(mediaWatchlist.priority), desc(mediaWatchlist.addedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const [countRow] = db.select({ total: count() }).from(mediaWatchlist).where(where).all();

  return { rows, total: countRow.total };
}

/** Get a single watchlist entry by id. Throws NotFoundError if missing. */
export function getWatchlistEntry(id: number): MediaWatchlistRow {
  const db = getDrizzle();
  const row = db.select().from(mediaWatchlist).where(eq(mediaWatchlist.id, id)).get();

  if (!row) throw new NotFoundError("WatchlistEntry", String(id));
  return row;
}

/** Add an item to the watchlist. Returns the created row. Throws ConflictError on duplicate. */
export function addToWatchlist(input: AddToWatchlistInput): MediaWatchlistRow {
  const db = getDrizzle();

  try {
    const result = db
      .insert(mediaWatchlist)
      .values({
        mediaType: input.mediaType,
        mediaId: input.mediaId,
        priority: input.priority !== undefined ? input.priority : undefined,
        notes: input.notes ?? null,
      })
      .run();

    return getWatchlistEntry(Number(result.lastInsertRowid));
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      throw new ConflictError(`${input.mediaType} ${input.mediaId} is already on the watchlist`);
    }
    throw err;
  }
}

/** Update a watchlist entry. Returns the updated row. */
export function updateWatchlistEntry(id: number, input: UpdateWatchlistInput): MediaWatchlistRow {
  getWatchlistEntry(id);

  const updates: Partial<typeof mediaWatchlist.$inferSelect> = {};

  if (input.priority !== undefined) updates.priority = input.priority ?? null;
  if (input.notes !== undefined) updates.notes = input.notes ?? null;

  if (Object.keys(updates).length > 0) {
    getDrizzle().update(mediaWatchlist).set(updates).where(eq(mediaWatchlist.id, id)).run();
  }

  return getWatchlistEntry(id);
}

/** Remove an entry from the watchlist. Throws NotFoundError if missing. */
export function removeFromWatchlist(id: number): void {
  getWatchlistEntry(id);

  const result = getDrizzle().delete(mediaWatchlist).where(eq(mediaWatchlist.id, id)).run();
  if (result.changes === 0) throw new NotFoundError("WatchlistEntry", String(id));
}

/** Batch-update priorities for reordering. */
export function reorderWatchlist(items: { id: number; priority: number }[]): void {
  if (items.length === 0) return;

  const db = getDrizzle();

  // Validate all IDs exist
  for (const item of items) {
    const row = db.select().from(mediaWatchlist).where(eq(mediaWatchlist.id, item.id)).get();
    if (!row) throw new NotFoundError("WatchlistEntry", String(item.id));
  }

  // Check for duplicate priorities
  const priorities = items.map((i) => i.priority);
  if (new Set(priorities).size !== priorities.length) {
    throw new ConflictError("Duplicate priorities in reorder request");
  }

  // Update all priorities in a transaction
  getDb().transaction(() => {
    for (const item of items) {
      db.update(mediaWatchlist)
        .set({ priority: item.priority })
        .where(eq(mediaWatchlist.id, item.id))
        .run();
    }
  })();
}

/**
 * Remove a watchlist entry by media type and media ID.
 * Returns true if an entry was removed, false if none existed.
 */
export function removeByMedia(mediaType: "movie" | "tv_show", mediaId: number): boolean {
  const result = getDrizzle()
    .delete(mediaWatchlist)
    .where(and(eq(mediaWatchlist.mediaType, mediaType), eq(mediaWatchlist.mediaId, mediaId)))
    .run();
  return result.changes > 0;
}
