/**
 * Opener for the food pillar's own SQLite database. Intentionally minimal —
 * it relies on drizzle-orm's built-in `migrate` helper to apply the
 * in-pillar migrations journal at `pillars/food/migrations/meta/_journal.json`.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { FoodDb } from './services/internal.js';

/**
 * Path to the migrations folder inside this pillar. Resolved relative
 * to this module's location (`src/db/open-food-db.ts` in dev,
 * `dist/db/open-food-db.js` after build) so it works both in the
 * workspace and when bundled into the pillar's Docker image.
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'migrations');
}

/**
 * Result of {@link openFoodDb}. The raw handle is exposed for callers
 * that need lifecycle control (close on shutdown, prepared statements,
 * pragmas the drizzle wrapper hides).
 */
export interface OpenedFoodDb {
  /** Drizzle handle — pass into any `prepStatesService.*` call. */
  db: FoodDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
}

/**
 * Open the food pillar's SQLite database at `path`, configure it,
 * apply the in-package migrations journal, and return both the
 * drizzle wrapper and the raw handle.
 *
 * Side effects:
 *   - The parent directory of `path` is created if missing (recursive).
 *   - `journal_mode=WAL`, `foreign_keys=ON`, and `busy_timeout=5000`
 *     are enabled.
 *   - Every migration in `pillars/food/migrations/meta/_journal.json` is
 *     applied via drizzle's built-in migrator (idempotent — re-running
 *     against the same DB short-circuits on the `__drizzle_migrations`
 *     hash check).
 *
 * If the migration apply throws (corrupt DB, malformed migration,
 * missing folder), the raw handle is closed before the error is
 * re-thrown so the caller can't leak a locked file descriptor.
 */
export function openFoodDb(path: string): OpenedFoodDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  const db = drizzle(raw) as FoodDb;
  try {
    migrate(db, { migrationsFolder: migrationsDir() });
  } catch (err) {
    raw.close();
    throw err;
  }
  return { db, raw };
}
