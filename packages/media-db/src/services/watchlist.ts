/**
 * Watchlist service — CRUD operations against the `watchlist` table on the
 * media pillar's SQLite database.
 *
 * Mirrors the legacy `apps/pops-api/src/modules/media/watchlist/service.ts`
 * surface but takes a `MediaDb` handle as the first argument so the calling
 * layer (pops-media-api routers, or future cross-pillar consumers) owns the
 * handle lifecycle. Matches the `@pops/core-db` / `@pops/finance-db`
 * per-pillar service signature pattern.
 *
 * Read-side enrichment (joining `title`/`posterUrl` against `movies` and
 * `tv_shows`) lives on the legacy pops-api list handler — those tables
 * have not been split into `@pops/media-db` yet, so the join cannot be
 * done from this side. Per PRD-167 PR 1 scope, reads stay on the legacy
 * surface and only the writer surface is mirrored here.
 */
import { and, asc, count, desc, eq, type SQL } from 'drizzle-orm';

import { mediaWatchlist } from '../schema.js';
import { isWatchlistMediaUniqueViolation } from './watchlist-unique-violation.js';

import type { MediaDb } from './internal.js';

export class WatchlistEntryNotFoundError extends Error {
  public readonly entryId: number;

  constructor(entryId: number) {
    super(`WatchlistEntry '${entryId}' not found`);
    this.entryId = entryId;
    this.name = 'WatchlistEntryNotFoundError';
  }
}

export class WatchlistReorderConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatchlistReorderConflictError';
  }
}

export type MediaWatchlistRow = typeof mediaWatchlist.$inferSelect;

export interface WatchlistFilters {
  mediaType?: 'movie' | 'tv_show';
}

export interface AddToWatchlistInput {
  mediaType: 'movie' | 'tv_show';
  mediaId: number;
  priority?: number | null;
  notes?: string | null;
}

export interface UpdateWatchlistInput {
  priority?: number | null;
  notes?: string | null;
}

export interface WatchlistListResult {
  rows: MediaWatchlistRow[];
  total: number;
}

/** List watchlist entries with optional filters. */
export function listWatchlist(
  db: MediaDb,
  filters: WatchlistFilters,
  limit: number,
  offset: number
): WatchlistListResult {
  const conditions: SQL[] = [];
  if (filters.mediaType) {
    conditions.push(eq(mediaWatchlist.mediaType, filters.mediaType));
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

  return { rows, total: countRow?.total ?? 0 };
}

/** Check whether a specific media item is on the watchlist. */
export function getWatchlistStatus(
  db: MediaDb,
  mediaType: 'movie' | 'tv_show',
  mediaId: number
): { onWatchlist: boolean; entryId: number | null } {
  const row = db
    .select({ id: mediaWatchlist.id })
    .from(mediaWatchlist)
    .where(and(eq(mediaWatchlist.mediaType, mediaType), eq(mediaWatchlist.mediaId, mediaId)))
    .get();
  return row ? { onWatchlist: true, entryId: row.id } : { onWatchlist: false, entryId: null };
}

/** Get a single watchlist entry by id. */
export function getWatchlistEntry(db: MediaDb, id: number): MediaWatchlistRow {
  const row = db.select().from(mediaWatchlist).where(eq(mediaWatchlist.id, id)).get();
  if (!row) throw new WatchlistEntryNotFoundError(id);
  return row;
}

/** Add an item to the watchlist. Idempotent on (mediaType, mediaId). */
export function addToWatchlist(
  db: MediaDb,
  input: AddToWatchlistInput
): { row: MediaWatchlistRow; created: boolean } {
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
    return { row: getWatchlistEntry(db, Number(result.lastInsertRowid)), created: true };
  } catch (err) {
    if (isWatchlistMediaUniqueViolation(err)) {
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
      if (existing) return { row: getWatchlistEntry(db, existing.id), created: false };
    }
    throw err;
  }
}

/** Update a watchlist entry. */
export function updateWatchlistEntry(
  db: MediaDb,
  id: number,
  input: UpdateWatchlistInput
): MediaWatchlistRow {
  getWatchlistEntry(db, id);

  const updates: Partial<typeof mediaWatchlist.$inferSelect> = {};
  if (input.priority !== undefined) updates.priority = input.priority ?? null;
  if (input.notes !== undefined) updates.notes = input.notes ?? null;

  if (Object.keys(updates).length > 0) {
    db.update(mediaWatchlist).set(updates).where(eq(mediaWatchlist.id, id)).run();
  }

  return getWatchlistEntry(db, id);
}

/** Remove an entry from the watchlist. */
export function removeFromWatchlist(db: MediaDb, id: number): void {
  getWatchlistEntry(db, id);
  const result = db.delete(mediaWatchlist).where(eq(mediaWatchlist.id, id)).run();
  if (result.changes === 0) throw new WatchlistEntryNotFoundError(id);
}

/**
 * Batch-reorder watchlist priorities. The entire rewrite runs inside a
 * single SQLite transaction so a mid-loop failure rolls back any earlier
 * UPDATEs — callers never observe a half-applied ordering.
 */
export function reorderWatchlist(db: MediaDb, items: { id: number; priority: number }[]): void {
  if (items.length === 0) return;

  const priorities = items.map((i) => i.priority);
  if (new Set(priorities).size !== priorities.length) {
    throw new WatchlistReorderConflictError('Duplicate priorities in reorder request');
  }

  db.transaction((tx) => {
    for (const item of items) {
      const row = tx
        .select({ id: mediaWatchlist.id })
        .from(mediaWatchlist)
        .where(eq(mediaWatchlist.id, item.id))
        .get();
      if (!row) throw new WatchlistEntryNotFoundError(item.id);
    }

    for (const item of items) {
      tx.update(mediaWatchlist)
        .set({ priority: item.priority })
        .where(eq(mediaWatchlist.id, item.id))
        .run();
    }
  });
}

/** Remove a watchlist entry by (mediaType, mediaId). Returns true on hit. */
export function removeByMedia(
  db: MediaDb,
  mediaType: 'movie' | 'tv_show',
  mediaId: number
): boolean {
  const result = db
    .delete(mediaWatchlist)
    .where(and(eq(mediaWatchlist.mediaType, mediaType), eq(mediaWatchlist.mediaId, mediaId)))
    .run();
  return result.changes > 0;
}

/**
 * Re-sequence priorities (0, 1, 2, …) to eliminate gaps. Runs inside a
 * single SQLite transaction so a mid-rewrite failure rolls back rather
 * than leaving the table partially renumbered.
 */
export function resequencePriorities(db: MediaDb): void {
  db.transaction((tx) => {
    const rows = tx
      .select({ id: mediaWatchlist.id })
      .from(mediaWatchlist)
      .orderBy(asc(mediaWatchlist.priority), desc(mediaWatchlist.addedAt))
      .all();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row) {
        tx.update(mediaWatchlist).set({ priority: i }).where(eq(mediaWatchlist.id, row.id)).run();
      }
    }
  });
}

/** Persist the Plex rating key for a watchlist entry (best-effort lookup result). */
export function setPlexRatingKey(db: MediaDb, watchlistId: number, ratingKey: string): void {
  db.update(mediaWatchlist)
    .set({ plexRatingKey: ratingKey })
    .where(eq(mediaWatchlist.id, watchlistId))
    .run();
}
