/**
 * Media pillar SQLite handle — lazy singleton + lifecycle.
 *
 * The earlier media slices (`movies`, `tv_shows`, `seasons`, `episodes`,
 * `shelf_impressions`, `watch_history`, `mediaWatchlist`,
 * `dismissed_discover`, `comparison_staleness`) finished their PR4 writer
 * cutovers, so the original boot-time backfill from the shared `pops.db`
 * was retired. Theme-13 Wave-5 brings the ATTACH bridge back for the new
 * tables landing in `0030_media_scores_baseline.sql` and
 * `0031_rotation_baseline.sql` — `media_scores` + `rotation_log` +
 * `rotation_sources` + `rotation_candidates` + `rotation_exclusions` —
 * via `backfillMediaFromShared`. Each TABLE_COPIES entry retires once its
 * writer cutover lands and is verified in prod.
 */
import { openMediaDb, type MediaDb, type OpenedMediaDb } from '@pops/media-db';

import { backfillMediaFromShared } from './backfill-media-from-shared.js';
import { resolveMediaSqlitePath } from './media-sqlite-path.js';

import type BetterSqlite3 from 'better-sqlite3';

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
 * Lazily open the media pillar's SQLite file and return the raw
 * better-sqlite3 handle. Used by hot paths that compose multi-statement
 * SQL — e.g. the overall rankings join across `media_scores`,
 * `comparison_dimensions`, `movies`, and `tv_shows` — where drizzle's
 * query builder loses too much fidelity to be useful.
 */
export function getMediaRawDb(): BetterSqlite3.Database {
  if (!mediaDb) {
    mediaDb = openMediaDb(resolveMediaSqlitePath());
  }
  return mediaDb.raw;
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

/**
 * Run the one-shot ATTACH backfill from the legacy shared pops.db into
 * the media pillar's media.db. No-op if the media handle isn't open
 * (e.g. boot still resolving). Idempotent against repeated boots via
 * per-table `WHERE NOT EXISTS (...)` filters. See
 * `backfill-media-from-shared.ts` for the table-by-table behaviour.
 */
export function backfillMediaFromSharedDb(sharedPath: string): void {
  if (!mediaDb) return;
  backfillMediaFromShared(mediaDb, sharedPath);
}
