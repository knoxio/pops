/**
 * Media pillar SQLite handle — lazy singleton + lifecycle.
 *
 * Every media-owned table (`movies`, `tv_shows`, `seasons`, `episodes`,
 * `shelf_impressions`, `watch_history`, `mediaWatchlist`,
 * `dismissed_discover`, `comparison_staleness`) now writes directly to
 * `media.db` via `getMediaDrizzle()`, so the boot-time ATTACH bridge from
 * the shared `pops.db` has been retired — there is nothing left to carry
 * forward. Mirrors the FULL EXIT precedent set by the core, inventory,
 * finance, food, and lists pillars.
 */
import { openMediaDb, type MediaDb, type OpenedMediaDb } from '@pops/media-db';

import { resolveMediaSqlitePath } from './media-sqlite-path.js';

let mediaDb: OpenedMediaDb | null = null;

/**
 * Lazily open the media pillar's SQLite file and return the drizzle
 * handle. Every media module routes its reads + writes through this
 * handle.
 */
export function getMediaDrizzle(): MediaDb {
  if (!mediaDb) {
    mediaDb = openMediaDb(resolveMediaSqlitePath());
  }
  return mediaDb.db;
}

/**
 * Close the media pillar's connection if it was opened. Idempotent —
 * safe to call from `closeDb()` on shutdown even when the media handle
 * was never resolved.
 */
export function closeMediaDb(): void {
  if (mediaDb) {
    mediaDb.raw.close();
    mediaDb = null;
  }
}

/**
 * Test-only: swap the media pillar handle. Called from `setupTestContext`
 * alongside `setCoreDb` to route both pillar handles at the same in-memory
 * DB, so test suites don't write to the dev `data/media.db` file. Returns
 * the previous handle (or null).
 */
export function setMediaDb(next: OpenedMediaDb | null): OpenedMediaDb | null {
  const prev = mediaDb;
  mediaDb = next;
  return prev;
}
