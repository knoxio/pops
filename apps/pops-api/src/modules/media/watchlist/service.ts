/**
 * Watchlist read/write surface — PRD-167 PR 2 cutover.
 *
 * Read/write split during the migration window (mirrors the watch-history
 * PR #3008 / movies PR #3006 pattern):
 *
 *  - `listWatchlist`, `getWatchlistEntry` and `getWatchlistStatus` are
 *    routed through `getMediaDrizzle()` (the media pillar's per-pillar
 *    `media.db.watchlist`) by forwarding to `@pops/media-db`'s
 *    `watchlistService`. The list-row enrichment (`title` / `posterUrl`
 *    join against `movies` / `tv_shows`) still runs through the raw
 *    `getDb()` handle against the shared `pops.db` because the legacy
 *    `movies` / `tv_shows` reads in this app continue to do so until
 *    PRD-165 PR 4 / PRD-166 PR 4 retire the shared copies — both stores
 *    stay in sync via the boot-time backfill so the join sees the same
 *    rows either way.
 *
 *  - Every write path — `addToWatchlist`, `updateWatchlistEntry`,
 *    `removeFromWatchlist`, `reorderWatchlist`, `removeByMedia`,
 *    `resequencePriorities` — still goes through `getDrizzle()` (the
 *    shared `pops.db`). Cross-module writers in this app
 *    (`watch-history/handlers/log-watch-event.ts`,
 *    `watch-history/handlers/batch-operations.ts`,
 *    `plex/sync-watchlist.ts`, `rotation/removal-selection.ts`, the
 *    discovery and comparisons readers) hold raw drizzle handles on
 *    `mediaWatchlist` and target `pops.db`; keeping writes on the same
 *    store avoids bifurcating new rows between the two SQLite files
 *    until the full slice can be moved.
 *
 * Cross-store consistency relies on `backfillMediaFromShared()` in
 * `apps/pops-api/src/db/media-backfill.ts`, which now copies the
 * `watchlist` table from `pops.db` -> `media.db` on boot (this PR
 * extends the `TABLE_COPIES` list). The copy is idempotent (`WHERE id
 * NOT IN (...)`). Between boots, newly-written rows live only in
 * `pops.db` and won't appear in `listWatchlist` / `getWatchlistEntry`
 * results until the next deploy reruns the backfill — the same
 * trade-off taken by the movies (PRD-165) and watch-history (PRD-168)
 * cutovers. Full read-your-writes consistency lands when the writers
 * also cut over.
 *
 * TOCTOU note: write paths that need an existence check (update /
 * remove / reorder) read it from `pops.db` directly via
 * `readSharedEntry` rather than going through the now-media-pillar
 * `getWatchlistEntry`. This keeps the check and the subsequent UPDATE /
 * DELETE on the same store so a row present on one side but not the
 * other can't produce inconsistent "not found vs. silent no-op"
 * behaviour. Mirrors the watch-history `deleteWatchHistoryEntry` fix
 * shipped in PR #3008.
 */
import { and, asc, desc, eq } from 'drizzle-orm';

import { mediaWatchlist } from '@pops/db-types';
import {
  watchlistService,
  WatchlistEntryNotFoundError,
  WatchlistReorderConflictError,
} from '@pops/media-db';

import { getDb, getDrizzle } from '../../../db.js';
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

/**
 * Read an entry off the shared `pops.db` — used by write paths to avoid a
 * cross-store TOCTOU. Exported as `getSharedWatchlistEntry` for callers
 * (e.g. the router's removal prefetch) that need a write-store-consistent
 * existence check during the cutover window: a row newly added since the
 * last boot lives only in `pops.db` and would 404 against the now-media-pillar
 * `getWatchlistEntry`. Drop this once writes also move to `media.db`.
 */
function readSharedEntry(id: number): MediaWatchlistRow {
  const row = getDrizzle().select().from(mediaWatchlist).where(eq(mediaWatchlist.id, id)).get();
  if (!row) throw new NotFoundError('WatchlistEntry', String(id));
  return row;
}

export { readSharedEntry as getSharedWatchlistEntry };

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

/** List watchlist entries with optional filters. Reads from the media pillar handle. */
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

/** Check whether a specific media item is on the watchlist. Reads from the media pillar handle. */
export function getWatchlistStatus(
  mediaType: 'movie' | 'tv_show',
  mediaId: number
): { onWatchlist: boolean; entryId: number | null } {
  return watchlistService.getWatchlistStatus(getMediaDrizzle(), mediaType, mediaId);
}

/** Get a single watchlist entry by id. Reads from the media pillar handle. */
export function getWatchlistEntry(id: number): MediaWatchlistRow {
  return translate(() => watchlistService.getWatchlistEntry(getMediaDrizzle(), id));
}

/**
 * Add an item to the watchlist. Idempotent — returns the existing entry if
 * already present. Writes go to `pops.db` (see file header for the split).
 */
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

    return { row: readSharedEntry(Number(result.lastInsertRowid)), created: true };
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
      if (existing) return { row: readSharedEntry(existing.id), created: false };
    }
    throw err;
  }
}

/** Update a watchlist entry. Returns the updated row. */
export function updateWatchlistEntry(id: number, input: UpdateWatchlistInput): MediaWatchlistRow {
  readSharedEntry(id);

  const updates: Partial<typeof mediaWatchlist.$inferSelect> = {};
  if (input.priority !== undefined) updates.priority = input.priority ?? null;
  if (input.notes !== undefined) updates.notes = input.notes ?? null;

  if (Object.keys(updates).length > 0) {
    getDrizzle().update(mediaWatchlist).set(updates).where(eq(mediaWatchlist.id, id)).run();
  }

  return readSharedEntry(id);
}

/** Remove an entry from the watchlist. Throws NotFoundError if missing. */
export function removeFromWatchlist(id: number): void {
  readSharedEntry(id);

  const result = getDrizzle().delete(mediaWatchlist).where(eq(mediaWatchlist.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('WatchlistEntry', String(id));
}

/** Batch-update priorities for reordering. */
export function reorderWatchlist(items: { id: number; priority: number }[]): void {
  if (items.length === 0) return;

  const db = getDrizzle();

  for (const item of items) {
    const row = db.select().from(mediaWatchlist).where(eq(mediaWatchlist.id, item.id)).get();
    if (!row) throw new NotFoundError('WatchlistEntry', String(item.id));
  }

  const priorities = items.map((i) => i.priority);
  if (new Set(priorities).size !== priorities.length) {
    throw new ConflictError('Duplicate priorities in reorder request');
  }

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
 * Accepts an optional drizzle-compatible instance to run inside an existing
 * transaction. Writes go to the shared `pops.db`; callers in this app
 * (e.g. `watch-history/handlers/log-watch-event.ts`) hold the matching
 * handle.
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
