/**
 * Standalone opener for the finance pillar's SQLite database.
 *
 * The opener is intentionally minimal — it does NOT load the sqlite-vec
 * extension (finance uses no vector indexes) and relies on drizzle-orm's
 * built-in `migrate` helper to apply this package's migrations journal at
 * `pillars/finance/migrations/meta/_journal.json`.
 *
 * The pillar's API host (`src/api/server.ts`) calls this on boot with the
 * path from `resolveFinanceSqlitePath` (`FINANCE_SQLITE_PATH` env var).
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { FinanceDb } from './services/internal.js';

/**
 * Path to the migrations folder inside this package. Resolved relative
 * to this module's location (`src/db/open-finance-db.ts` in dev,
 * `dist/db/open-finance-db.js` after build) so it works both from source
 * and when bundled into a Docker image's `node_modules/@pops/finance/`.
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'migrations');
}

/** Result of {@link openFinanceDb}. The raw handle is exposed for callers
 * that need lifecycle control (close on shutdown, prepared statements,
 * pragmas the drizzle wrapper hides). */
export interface OpenedFinanceDb {
  /** Drizzle handle — pass into any `wishListService.*` call. */
  db: FinanceDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
}

/**
 * Open the finance pillar's SQLite database at `path`, configure it,
 * apply the in-package migrations journal, and return both the drizzle
 * wrapper and the raw handle.
 *
 * Side effects:
 *   - The parent directory of `path` is created if missing (recursive).
 *   - `journal_mode=WAL`, `foreign_keys=ON`, and `busy_timeout=5000`
 *     are enabled.
 *   - Every migration in `migrations/meta/_journal.json` is applied via
 *     drizzle's built-in migrator (idempotent — re-running against the
 *     same DB short-circuits on the `__drizzle_migrations` hash check).
 *
 * If the migration apply throws (corrupt DB, malformed migration,
 * missing folder), the raw handle is closed before the error is
 * re-thrown so the caller can't leak a locked file descriptor.
 *
 * The journal is self-bootstrapping: idx 0
 * `0053_finance_pillar_baseline` CREATEs the tables the later
 * `0025`/`0026`/`0027`/`0052` entries ALTER, so against a fresh
 * finance.db the baseline runs first.
 */
export function openFinanceDb(path: string): OpenedFinanceDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  const db = drizzle(raw) as FinanceDb;
  try {
    migrate(db, { migrationsFolder: migrationsDir() });
  } catch (err) {
    raw.close();
    throw err;
  }
  return { db, raw };
}
