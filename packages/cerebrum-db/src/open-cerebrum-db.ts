/**
 * Standalone opener for the cerebrum pillar's SQLite database.
 *
 * Phase 2 PR 1 of the cerebrum pillar migration scaffolds the
 * per-pillar connection so subsequent PRs can flip readers/writers
 * over without touching pops-api's existing singleton. The opener is
 * intentionally minimal — it relies on drizzle-orm's built-in
 * `migrate` helper to apply the in-package migrations journal at
 * `packages/cerebrum-db/migrations/meta/_journal.json`.
 *
 * No production consumer wires this up yet. Subsequent PRs add the
 * `CEREBRUM_SQLITE_PATH` env-var read in pops-api, the boot-time
 * call, and the ATTACH-based backfill of nudge_log rows from the
 * shared pops.db.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { CerebrumDb } from './services/internal.js';

/**
 * Path to the migrations folder inside this package. Resolved relative
 * to this module's location (`src/open-cerebrum-db.ts` in dev,
 * `dist/open-cerebrum-db.js` after build) so it works both when
 * consumed via the workspace symlink and when bundled into a Docker
 * image's `node_modules/@pops/cerebrum-db/`.
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'migrations');
}

/**
 * Result of {@link openCerebrumDb}. The raw handle is exposed for callers
 * that need lifecycle control (close on shutdown, prepared statements,
 * pragmas the drizzle wrapper hides).
 */
export interface OpenedCerebrumDb {
  /** Drizzle handle — pass into any `nudgeLogService.*` call. */
  db: CerebrumDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
}

/**
 * Open the cerebrum pillar's SQLite database at `path`, configure
 * it, apply the in-package migrations journal, and return both the
 * drizzle wrapper and the raw handle.
 *
 * Side effects:
 *   - The parent directory of `path` is created if missing (recursive).
 *   - `journal_mode=WAL`, `foreign_keys=ON`, and `busy_timeout=5000`
 *     are enabled to match the shared singleton in
 *     `apps/pops-api/src/db.ts`.
 *   - Every migration in
 *     `packages/cerebrum-db/migrations/meta/_journal.json` is applied
 *     via drizzle's built-in migrator (idempotent — re-running against
 *     the same DB short-circuits on the `__drizzle_migrations` hash
 *     check). Today that's `0039_dry_fabian_cortez` (creates
 *     `nudge_log`) and `0044_nudge_log` (the idempotent safety
 *     re-creation).
 *
 * If the migration apply throws (corrupt DB, malformed migration,
 * missing folder), the raw handle is closed before the error is
 * re-thrown so the caller can't leak a locked file descriptor.
 */
export function openCerebrumDb(path: string): OpenedCerebrumDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  const db = drizzle(raw) as CerebrumDb;
  try {
    migrate(db, { migrationsFolder: migrationsDir() });
  } catch (err) {
    raw.close();
    throw err;
  }
  return { db, raw };
}
