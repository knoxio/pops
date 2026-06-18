/**
 * Standalone opener for the core pillar's SQLite database.
 *
 * Phase 2 PR 1 of the core pillar migration scaffolds the per-pillar
 * connection so subsequent PRs can flip readers/writers over without
 * touching pops-api's existing singleton. The opener is intentionally
 * minimal — it does NOT load the sqlite-vec extension or the
 * vector-index helpers (those stay with pops-api's `getDrizzle()` for
 * now) and it relies on drizzle-orm's built-in `migrate` helper to apply
 * the in-package migrations journal at `pillars/core/migrations/meta/_journal.json`.
 *
 * No production consumer wires this up yet. Subsequent PRs add the
 * `CORE_SQLITE_PATH` env-var read, the boot-time call, and the data
 * backfill from the shared pops.db.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { CoreDb } from './services/internal.js';

/**
 * Path to the migrations folder inside this package. Resolved relative
 * to this module's location (`src/open-core-db.ts` in dev,
 * `dist/open-core-db.js` after build) so it works both when consumed
 * via the workspace symlink and when bundled into a Docker image's
 * `node_modules/@pops/core-db/`.
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'migrations');
}

/** Result of {@link openCoreDb}. The raw handle is exposed for callers
 * that need lifecycle control (close on shutdown, prepared statements,
 * pragmas the drizzle wrapper hides). */
export interface OpenedCoreDb {
  /** Drizzle handle — pass into any `serviceAccountsService.*` call. */
  db: CoreDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
}

/**
 * Open the core pillar's SQLite database at `path`, configure it, apply
 * the in-package migrations journal, and return both the drizzle wrapper
 * and the raw handle.
 *
 * Side effects:
 *   - The parent directory of `path` is created if missing (recursive).
 *   - `journal_mode=WAL`, `foreign_keys=ON`, and `busy_timeout=5000` are
 *     enabled to match the shared singleton in `apps/pops-api/src/db.ts`.
 *   - Every migration in `packages/core-db/migrations/meta/_journal.json`
 *     is applied via drizzle's built-in migrator (idempotent — re-running
 *     against the same DB short-circuits on the `__drizzle_migrations`
 *     hash check).
 *
 * If the migration apply throws (corrupt DB, malformed migration, missing
 * folder), the raw handle is closed before the error is re-thrown so the
 * caller can't leak a locked file descriptor.
 */
export function openCoreDb(path: string): OpenedCoreDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  const db = drizzle(raw) as CoreDb;
  try {
    migrate(db, { migrationsFolder: migrationsDir() });
  } catch (err) {
    raw.close();
    throw err;
  }
  return { db, raw };
}
