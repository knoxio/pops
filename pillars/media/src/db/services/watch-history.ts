/**
 * Watch history CRUD against the media pillar's SQLite via drizzle.
 *
 * `watchedAt` is stored as SQLite `datetime('now')` text — second-precision
 * `YYYY-MM-DD HH:MM:SS` UTC. When the caller omits it on insert we resolve
 * the value in JS up front (same format) so it can be reused for the row,
 * the conflict error, and any caller-side log. The unique index covers
 * `(media_type, media_id, watched_at)`, so two omitted inserts for the
 * same item inside the same second deliberately raise
 * `WatchHistoryConflictError` with the resolved timestamp.
 *
 * Cross-table orchestration (auto-removing watchlist rows on a movie
 * completion, queueing a debrief session, resetting comparison staleness, …)
 * stays at the router/module layer. This package owns persistence;
 * orchestration is a caller concern.
 */
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import { WatchHistoryConflictError, WatchHistoryNotFoundError } from '../errors.js';
import { watchHistory } from '../schema.js';

import type { MediaDb } from './internal.js';

/** Raw drizzle row shape — the persisted watch_history record. */
export type WatchHistoryRow = typeof watchHistory.$inferSelect;

/** Public alias for the persisted watch history entry. */
export type WatchHistoryEntry = WatchHistoryRow;

/** Media types that can appear in watch_history. */
export type WatchHistoryMediaType = 'movie' | 'episode';

/** Filters accepted by {@link list}. */
export interface WatchHistoryFilters {
  mediaType?: WatchHistoryMediaType | undefined;
  mediaId?: number | undefined;
  completed?: number | undefined;
}

/** Count + rows for a paginated list. */
export interface WatchHistoryListResult {
  rows: WatchHistoryRow[];
  total: number;
}

/** Mutable subset accepted on add. */
export interface AddWatchHistoryInput {
  mediaType: WatchHistoryMediaType;
  mediaId: number;
  watchedAt?: string | undefined;
  completed?: number | undefined;
  blacklisted?: number | undefined;
}

/** PATCH-shape — every field optional. */
export interface UpdateWatchHistoryInput {
  mediaType?: WatchHistoryMediaType;
  mediaId?: number;
  watchedAt?: string;
  completed?: number;
  blacklisted?: number;
}

function buildListWhere(filters: WatchHistoryFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.mediaType !== undefined) {
    conditions.push(eq(watchHistory.mediaType, filters.mediaType));
  }
  if (filters.mediaId !== undefined) {
    conditions.push(eq(watchHistory.mediaId, filters.mediaId));
  }
  if (filters.completed !== undefined) {
    conditions.push(eq(watchHistory.completed, filters.completed));
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** List watch history entries with optional filters. Ordered by `watched_at DESC`. */
export function list(
  db: MediaDb,
  filters: WatchHistoryFilters,
  limit: number,
  offset: number
): WatchHistoryListResult {
  const where = buildListWhere(filters);

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

/**
 * All watch history for a single media item. Ordered by `watched_at DESC`
 * — the most-recent watch first.
 */
export function byItem(
  db: MediaDb,
  mediaType: WatchHistoryMediaType,
  mediaId: number
): WatchHistoryRow[] {
  return db
    .select()
    .from(watchHistory)
    .where(and(eq(watchHistory.mediaType, mediaType), eq(watchHistory.mediaId, mediaId)))
    .orderBy(desc(watchHistory.watchedAt))
    .all();
}

/**
 * All watch history rows in `[startDate, endDate]` (inclusive on both
 * ends — the heaviest production query). Optional `mediaType` filter
 * narrows the time-range scan. Ordered by `watched_at DESC`.
 */
export function byDateRange(
  db: MediaDb,
  startDate: string,
  endDate: string,
  mediaType?: WatchHistoryMediaType
): WatchHistoryRow[] {
  const conditions: SQL[] = [
    gte(watchHistory.watchedAt, startDate),
    lte(watchHistory.watchedAt, endDate),
  ];
  if (mediaType !== undefined) {
    conditions.push(eq(watchHistory.mediaType, mediaType));
  }
  return db
    .select()
    .from(watchHistory)
    .where(and(...conditions))
    .orderBy(desc(watchHistory.watchedAt))
    .all();
}

/**
 * Insert a new watch history row. Returns the persisted row.
 *
 * Throws `WatchHistoryConflictError` if the `(media_type, media_id, watched_at)`
 * unique index rejects the insert. Callers that need idempotent semantics
 * (e.g. plex sync) should catch and skip — or use `INSERT OR IGNORE`
 * directly via the raw handle while we keep the public service strict.
 */
/**
 * Format a JS Date as the second-precision UTC string SQLite returns from
 * `datetime('now')` — `YYYY-MM-DD HH:MM:SS`. Used to materialise
 * `watchedAt` up front when the caller omits it on insert, so the value
 * survives into the conflict error.
 */
function nowSqliteDatetime(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function add(db: MediaDb, input: AddWatchHistoryInput): WatchHistoryRow {
  const watchedAt = input.watchedAt ?? nowSqliteDatetime();
  const values: typeof watchHistory.$inferInsert = {
    mediaType: input.mediaType,
    mediaId: input.mediaId,
    watchedAt,
    ...(input.completed !== undefined ? { completed: input.completed } : {}),
    ...(input.blacklisted !== undefined ? { blacklisted: input.blacklisted } : {}),
  };
  try {
    const result = db.insert(watchHistory).values(values).run();
    const row = db
      .select()
      .from(watchHistory)
      .where(eq(watchHistory.id, Number(result.lastInsertRowid)))
      .get();
    if (!row) throw new WatchHistoryNotFoundError(Number(result.lastInsertRowid));
    return row;
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new WatchHistoryConflictError(input.mediaType, input.mediaId, watchedAt);
    }
    throw err;
  }
}

type WatchHistoryUpdate = Partial<typeof watchHistory.$inferInsert>;

function buildUpdatePatch(input: UpdateWatchHistoryInput): WatchHistoryUpdate | null {
  const updates: WatchHistoryUpdate = {};
  let touched = false;

  if (input.mediaType !== undefined) {
    updates.mediaType = input.mediaType;
    touched = true;
  }
  if (input.mediaId !== undefined) {
    updates.mediaId = input.mediaId;
    touched = true;
  }
  if (input.watchedAt !== undefined) {
    updates.watchedAt = input.watchedAt;
    touched = true;
  }
  if (input.completed !== undefined) {
    updates.completed = input.completed;
    touched = true;
  }
  if (input.blacklisted !== undefined) {
    updates.blacklisted = input.blacklisted;
    touched = true;
  }

  if (!touched) return null;
  return updates;
}

/**
 * Get a single watch history entry by id. Throws
 * `WatchHistoryNotFoundError` if missing.
 */
export function getById(db: MediaDb, id: number): WatchHistoryRow {
  const row = db.select().from(watchHistory).where(eq(watchHistory.id, id)).get();
  if (!row) throw new WatchHistoryNotFoundError(id);
  return row;
}

/**
 * Patch a watch history entry. Throws `WatchHistoryNotFoundError` if missing.
 * No-op writes (empty `input`) still re-read the row but skip the UPDATE.
 */
export function update(db: MediaDb, id: number, input: UpdateWatchHistoryInput): WatchHistoryRow {
  getById(db, id);
  const patch = buildUpdatePatch(input);
  if (patch) {
    try {
      db.update(watchHistory).set(patch).where(eq(watchHistory.id, id)).run();
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        const current = getById(db, id);
        throw new WatchHistoryConflictError(
          input.mediaType ?? current.mediaType,
          input.mediaId ?? current.mediaId,
          input.watchedAt ?? current.watchedAt
        );
      }
      throw err;
    }
  }
  return getById(db, id);
}

/** Delete a watch history entry. Throws `WatchHistoryNotFoundError` if missing. */
function deleteById(db: MediaDb, id: number): void {
  getById(db, id);
  const result = db.delete(watchHistory).where(eq(watchHistory.id, id)).run();
  if (result.changes === 0) throw new WatchHistoryNotFoundError(id);
}

export { deleteById as delete };
