import { resolveSqlitePath } from './sqlite-path.js';

/**
 * One-shot media-pillar backfill — copies shelf-impressions rows from the
 * shared `pops.db` into `media.db` via ATTACH.
 *
 * Boot-time contract: Phase 2 PR 2 opened the media DB but did not yet
 * consume it. PR 3 (this entry point) flipped shelf-impressions traffic
 * to the media handle, so the first deploy after PR 3 carries the
 * existing rows across before any reads come from the new file.
 * Subsequent boots find the media copy already populated and become a
 * no-op via the `WHERE id NOT IN (...)` existence filter.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk `pops.db` never bricks the boot path. Failures here leave
 * the media copy empty for that boot; the next deploy retries.
 *
 * Mirrors `./core-backfill.ts`.
 */
import type Database from 'better-sqlite3';

/**
 * Run the idempotent backfill against the open media SQLite handle. The
 * caller resolves the raw better-sqlite3 handle (typically
 * `getMediaDrizzle()`'s sibling `OpenedMediaDb.raw`) and passes it in so
 * this module stays decoupled from the singleton in
 * `./media-db-handle.ts`.
 */
export function backfillMediaFromShared(mediaRaw: Database.Database | null): void {
  if (!mediaRaw) return;
  const sharedPath = resolveSqlitePath();
  try {
    mediaRaw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      const hasTable = mediaRaw
        .prepare("SELECT 1 FROM pops.sqlite_master WHERE type='table' AND name='shelf_impressions'")
        .get();
      if (hasTable) {
        // Enumerate columns explicitly so a future migration that widens
        // the media table won't break the backfill against a stale
        // on-disk pops.db that still has the older shape. Order matches
        // the 0021_spooky_lockheed.sql DDL byte-for-byte.
        mediaRaw.exec(`
          INSERT INTO shelf_impressions (id, shelf_id, shown_at)
          SELECT id, shelf_id, shown_at
          FROM pops.shelf_impressions
          WHERE id NOT IN (SELECT id FROM shelf_impressions)
        `);
      }
    } finally {
      mediaRaw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Media shelf-impressions backfill failed (non-fatal):', err);
  }
}
