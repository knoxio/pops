import { resolveSqlitePath } from './sqlite-path.js';

/**
 * One-shot core-pillar backfill — copies service-account rows from the
 * shared `pops.db` into `core.db` via ATTACH.
 *
 * Lifted out of `db.ts` so that file stays under the eslint(max-lines) cap
 * once the core + inventory + media pillar handles + the closes all
 * landed there. The behaviour is unchanged.
 *
 * Boot-time contract: Phase 2 PR 2 opened the core DB but did not yet
 * consume it. PR 3 (this entry point) flipped service-accounts traffic
 * to the core handle, so the first deploy after PR 3 carried the existing
 * rows across before any reads came from the new file. Subsequent boots
 * find the core copy already populated and become a no-op via the
 * `WHERE id NOT IN (...)` existence filter.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Failures here leave
 * the core copy empty for that boot; the next deploy retries.
 */
import type Database from 'better-sqlite3';

/**
 * Run the idempotent backfill against the open core SQLite handle. The
 * caller resolves the raw better-sqlite3 handle (typically
 * `getCoreDrizzle()`'s sibling `OpenedCoreDb.raw`) and passes it in so
 * this module stays decoupled from the singleton in `db.ts`.
 */
export function backfillCoreFromShared(coreRaw: Database.Database | null): void {
  if (!coreRaw) return;
  const sharedPath = resolveSqlitePath();
  try {
    coreRaw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      const hasTable = coreRaw
        .prepare("SELECT 1 FROM pops.sqlite_master WHERE type='table' AND name='service_accounts'")
        .get();
      if (hasTable) {
        // Enumerate columns explicitly so a future migration that
        // widens the core table won't break the backfill against a
        // stale on-disk pops.db that still has the older shape. Order
        // matches the 0054_service_accounts.sql DDL byte-for-byte.
        coreRaw.exec(`
          INSERT INTO service_accounts (
            id, name, key_prefix, key_hash, scopes,
            created_at, last_used_at, revoked_at, created_by
          )
          SELECT
            id, name, key_prefix, key_hash, scopes,
            created_at, last_used_at, revoked_at, created_by
          FROM pops.service_accounts
          WHERE id NOT IN (SELECT id FROM service_accounts)
        `);
      }
    } finally {
      coreRaw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Core service-accounts backfill failed (non-fatal):', err);
  }
}
