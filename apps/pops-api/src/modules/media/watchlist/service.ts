/**
 * Watchlist service — CRUD operations against SQLite via Drizzle ORM.
 */
import { mediaWatchlist } from '@pops/db-types';
import { and, asc, count, desc, eq, type SQL } from 'drizzle-orm';

import { getDb, getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import type {
  AddToWatchlistInput,
  EnrichedWatchlistRow,
  MediaWatchlistRow,
  UpdateWatchlistInput,
  WatchlistFilters,
} from './types.js';

/** Count + rows for a paginated list. */
export interface WatchlistListResult {
  rows: EnrichedWatchlistRow[];
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
    conditions.push(eq(mediaWatchlist.mediaType, filters.mediaType as 'movie' | 'tv_show'));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rawRows = db
    .select()
    .from(mediaWatchlist)
    .where(where)
    .orderBy(asc(mediaWatchlist.priority), desc(mediaWatchlist.addedAt))
    .limit(limit)
    .offset(offset)
    .all();

  // Enrich with title and poster from movies/tv_shows tables
  const rawDb = getDb();
  const rows = rawRows.map((row) => {
    let title: string | null = null;
    let posterUrl: string | null = null;

    if (row.mediaType === 'movie') {
      const movie = rawDb
        .prepare('SELECT title, tmdb_id, poster_path FROM movies WHERE id = ?')
        .get(row.mediaId) as
        | { title: string; tmdb_id: number; poster_path: string | null }
        | undefined;
      if (movie) {
        title = movie.title;
        posterUrl = movie.poster_path ? `/media/images/movie/${movie.tmdb_id}/poster.jpg` : null;
      }
    } else if (row.mediaType === 'tv_show') {
      const show = rawDb
        .prepare('SELECT name, tvdb_id, poster_path FROM tv_shows WHERE id = ?')
        .get(row.mediaId) as
        | { name: string; tvdb_id: number; poster_path: string | null }
        | undefined;
      if (show) {
        title = show.name;
        posterUrl = show.poster_path ? `/media/images/tv/${show.tvdb_id}/poster.jpg` : null;
      }
    }

    return { ...row, title, posterUrl };
  });

  const [countRow] = db.select({ total: count() }).from(mediaWatchlist).where(where).all();

  return { rows, total: countRow?.total ?? 0 };
}

/** Check whether a specific media item is on the watchlist. Returns entry ID if present. */
export function getWatchlistStatus(
  mediaType: 'movie' | 'tv_show',
  mediaId: number
): { onWatchlist: boolean; entryId: number | null } {
  const db = getDrizzle();
  const row = db
    .select({ id: mediaWatchlist.id })
    .from(mediaWatchlist)
    .where(and(eq(mediaWatchlist.mediaType, mediaType), eq(mediaWatchlist.mediaId, mediaId)))
    .get();
  return row ? { onWatchlist: true, entryId: row.id } : { onWatchlist: false, entryId: null };
}

/** Get a single watchlist entry by id. Throws NotFoundError if missing. */
export function getWatchlistEntry(id: number): MediaWatchlistRow {
  const db = getDrizzle();
  const row = db.select().from(mediaWatchlist).where(eq(mediaWatchlist.id, id)).get();

  if (!row) throw new NotFoundError('WatchlistEntry', String(id));
  return row;
}

/** Add an item to the watchlist. Idempotent — returns the existing entry if already present. */
export function addToWatchlist(input: AddToWatchlistInput): {
  row: MediaWatchlistRow;
  created: boolean;
} {
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

    return { row: getWatchlistEntry(Number(result.lastInsertRowid)), created: true };
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      const existing = db
        .select()
        .from(mediaWatchlist)
        .where(
          and(
            eq(mediaWatchlist.mediaType, input.mediaType),
            eq(mediaWatchlist.mediaId, input.mediaId)
          )
        )
        .get();
      if (existing) return { row: getWatchlistEntry(existing.id), created: false };
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
  if (result.changes === 0) throw new NotFoundError('WatchlistEntry', String(id));
}

/** Batch-update priorities for reordering. */
export function reorderWatchlist(items: { id: number; priority: number }[]): void {
  if (items.length === 0) return;

  const db = getDrizzle();

  // Validate all IDs exist
  for (const item of items) {
    const row = db.select().from(mediaWatchlist).where(eq(mediaWatchlist.id, item.id)).get();
    if (!row) throw new NotFoundError('WatchlistEntry', String(item.id));
  }

  // Check for duplicate priorities
  const priorities = items.map((i) => i.priority);
  if (new Set(priorities).size !== priorities.length) {
    throw new ConflictError('Duplicate priorities in reorder request');
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
export function removeByMedia(mediaType: 'movie' | 'tv_show', mediaId: number): boolean {
  const result = getDrizzle()
    .delete(mediaWatchlist)
    .where(and(eq(mediaWatchlist.mediaType, mediaType), eq(mediaWatchlist.mediaId, mediaId)))
    .run();
  return result.changes > 0;
}

/**
 * Re-sequence all watchlist priorities to eliminate gaps (0, 1, 2, ...).
 * Accepts an optional drizzle-compatible instance to run inside an existing transaction.
 */
export function resequencePriorities(drizzleInstance?: ReturnType<typeof getDrizzle>): void {
  const db = drizzleInstance ?? getDrizzle();
  const rows = db
    .select({ id: mediaWatchlist.id })
    .from(mediaWatchlist)
    .orderBy(asc(mediaWatchlist.priority), desc(mediaWatchlist.addedAt))
    .all();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row) {
      db.update(mediaWatchlist).set({ priority: i }).where(eq(mediaWatchlist.id, row.id)).run();
    }
  }
}
