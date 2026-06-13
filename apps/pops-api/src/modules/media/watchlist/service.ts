/**
 * Watchlist read/write surface — MEDIA FULL EXIT.
 *
 * Every CRUD path now resolves `getMediaDrizzle()` and forwards to
 * `@pops/media-db`'s `watchlistService`. Reads and writes hit the same
 * `media.db.watchlist` table, so the read-your-writes consistency window
 * that the cutover-period shared-store TOCTOU shim
 * (`getSharedWatchlistEntry`) papered over is closed: removed.
 *
 * List enrichment (`title` / `posterUrl`) still joins against the shared
 * `movies` / `tv_shows` tables via the raw `getDb()` handle — those tables
 * have not been split out of `@pops/media-db`'s read surface yet. The
 * join sees the canonical movies/tv-shows rows because every writer
 * already lands on the media handle.
 */
import { asc, desc, eq } from 'drizzle-orm';

import { mediaWatchlist } from '@pops/db-types';
import {
  watchlistService,
  WatchlistEntryNotFoundError,
  WatchlistReorderConflictError,
  type MediaDb,
} from '@pops/media-db';

import { getDb } from '../../../db.js';
import { getMediaDrizzle } from '../../../db/media-db-handle.js';
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

function narrowMediaType(value: string | undefined): 'movie' | 'tv_show' | undefined {
  if (value === 'movie' || value === 'tv_show') return value;
  return undefined;
}

function translate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof WatchlistEntryNotFoundError) {
      throw new NotFoundError('WatchlistEntry', String(err.entryId));
    }
    if (err instanceof WatchlistReorderConflictError) {
      throw new ConflictError(err.message);
    }
    throw err;
  }
}

function enrichRow(row: MediaWatchlistRow): EnrichedWatchlistRow {
  const rawDb = getDb();
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
}

/** List watchlist entries with optional filters. */
export function listWatchlist(
  filters: WatchlistFilters,
  limit: number,
  offset: number
): WatchlistListResult {
  const { rows, total } = watchlistService.listWatchlist(
    getMediaDrizzle(),
    { mediaType: narrowMediaType(filters.mediaType) },
    limit,
    offset
  );
  return { rows: rows.map(enrichRow), total };
}

/** Check whether a specific media item is on the watchlist. */
export function getWatchlistStatus(
  mediaType: 'movie' | 'tv_show',
  mediaId: number
): { onWatchlist: boolean; entryId: number | null } {
  return watchlistService.getWatchlistStatus(getMediaDrizzle(), mediaType, mediaId);
}

/** Get a single watchlist entry by id. */
export function getWatchlistEntry(id: number): MediaWatchlistRow {
  return translate(() => watchlistService.getWatchlistEntry(getMediaDrizzle(), id));
}

/**
 * Add an item to the watchlist. Idempotent on `(mediaType, mediaId)` —
 * returns the existing entry if already present.
 */
export function addToWatchlist(input: AddToWatchlistInput): {
  row: MediaWatchlistRow;
  created: boolean;
} {
  return translate(() => watchlistService.addToWatchlist(getMediaDrizzle(), input));
}

/** Update a watchlist entry. Returns the updated row. */
export function updateWatchlistEntry(id: number, input: UpdateWatchlistInput): MediaWatchlistRow {
  return translate(() => watchlistService.updateWatchlistEntry(getMediaDrizzle(), id, input));
}

/** Remove an entry from the watchlist. Throws NotFoundError if missing. */
export function removeFromWatchlist(id: number): void {
  translate(() => watchlistService.removeFromWatchlist(getMediaDrizzle(), id));
}

/** Batch-update priorities for reordering. */
export function reorderWatchlist(items: { id: number; priority: number }[]): void {
  translate(() => watchlistService.reorderWatchlist(getMediaDrizzle(), items));
}

/**
 * Remove a watchlist entry by media type and media ID.
 * Returns true if an entry was removed, false if none existed.
 */
export function removeByMedia(mediaType: 'movie' | 'tv_show', mediaId: number): boolean {
  return watchlistService.removeByMedia(getMediaDrizzle(), mediaType, mediaId);
}

/**
 * Re-sequence all watchlist priorities to eliminate gaps (0, 1, 2, ...).
 * Accepts an optional drizzle-compatible handle so callers running inside
 * an existing `getMediaDrizzle().transaction(...)` (logWatch +
 * batchLogWatch) can reuse the same tx — the standalone codepath opens
 * its own media handle.
 */
export function resequencePriorities(drizzleInstance?: MediaDb): void {
  const db = drizzleInstance ?? getMediaDrizzle();
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
