/**
 * Media pillar SQLite handle — lazy singleton + lifecycle.
 *
 * Lifted out of `db.ts` to keep that file under the eslint(max-lines) cap
 * once the core + media pillar handles both lived there. The behaviour
 * mirrors the core counterpart in shape (lazy open, idempotent close,
 * test-only swap).
 *
 * Phase 2 PR 2 of the media pillar migration: the handle is opened at
 * first call but production traffic still flows through the shared
 * singleton in `db.ts`. PR 3 of phase 2 flips shelf-impressions traffic
 * over to this handle; PR 4 drops the table from the shared journal +
 * adds the Litestream config.
 */
import { openMediaDb, type MediaDb, type OpenedMediaDb } from '@pops/media-db';

import { resolveMediaSqlitePath } from './media-sqlite-path.js';

let mediaDb: OpenedMediaDb | null = null;

/**
 * Lazily open the media pillar's SQLite file and return the drizzle
 * handle. Phase 2 PR 2 wires the connection up at boot but does NOT
 * yet route any production traffic through it — the existing shared
 * singleton continues to serve every read/write. The handle is here so
 * PR 3 can flip shelf-impressions callers over with a one-line edit.
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
 * Test-only: swap the media pillar handle. Used by `setupTestContext`
 * to inject an in-memory DB so test suites don't write to the dev
 * `data/media.db` file. Returns the previous handle (or null).
 */
export function setMediaDb(next: OpenedMediaDb | null): OpenedMediaDb | null {
  const prev = mediaDb;
  mediaDb = next;
  return prev;
}
