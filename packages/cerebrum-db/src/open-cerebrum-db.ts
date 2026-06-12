/**
 * Standalone opener for the cerebrum pillar's SQLite database.
 *
 * Phase 2 PR 1 of the cerebrum pillar migration scaffolded the
 * per-pillar connection so subsequent PRs can flip readers/writers over
 * without touching pops-api's existing singleton. PRD-179 US-01 layered
 * the engrams slice on top — adding sqlite-vec extension loading before
 * the migration apply so the `embeddings_vec` virtual table (cerebrum's
 * only vector consumer) can be created on first open.
 *
 * The opener is intentionally minimal — it relies on drizzle-orm's
 * built-in `migrate` helper to apply the in-package migrations journal
 * at `packages/cerebrum-db/migrations/meta/_journal.json`. Today that
 * covers the nudge_log tables (0039, 0044) and the engrams baseline
 * (0050). The `embeddings_vec` virtual table is created imperatively
 * after `tryLoadVecExtension` succeeds — kept out of the drizzle
 * migration journal because virtual tables aren't representable in the
 * schema builder and because we tolerate a missing extension on the
 * non-vector cerebrum consumers (engram CRUD, nudges).
 *
 * No production consumer wires this up yet. Subsequent PRs add the
 * `CEREBRUM_SQLITE_PATH` env-var read in pops-api, the boot-time call,
 * and the ATTACH-based backfill of cerebrum-owned rows from the shared
 * pops.db.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import {
  ensureEmbeddingsVecTable,
  tryLoadVecExtension,
  type VecLoaderLogger,
} from './vec-loader.js';

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

export interface OpenCerebrumDbOptions {
  /**
   * Whether to attempt loading the sqlite-vec extension. Defaults to
   * `true` so production wiring picks up vector support automatically;
   * tests for non-vector cerebrum consumers can pass `false` to keep the
   * boot fast and avoid sqlite-vec install requirements in CI sandboxes.
   */
  loadVec?: boolean;
  /** Optional logger forwarded to the vec loader. */
  logger?: VecLoaderLogger;
}

/**
 * Result of {@link openCerebrumDb}. The raw handle is exposed for callers
 * that need lifecycle control (close on shutdown, prepared statements,
 * pragmas the drizzle wrapper hides). `vecAvailable` records whether
 * sqlite-vec actually loaded on this connection so callers can branch
 * on it without re-probing.
 */
export interface OpenedCerebrumDb {
  /** Drizzle handle — pass into any `*Service.*` call. */
  db: CerebrumDb;
  /** Raw better-sqlite3 handle. Call `.close()` on shutdown. */
  raw: Database.Database;
  /** True iff sqlite-vec was loaded successfully on this connection. */
  vecAvailable: boolean;
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
 *   - When `options.loadVec !== false`, `tryLoadVecExtension(raw)` runs
 *     before the migration apply so the `embeddings_vec` virtual table
 *     can be created afterwards via `ensureEmbeddingsVecTable`. Failures
 *     are non-fatal — `vecAvailable` is reported on the result.
 *   - Every migration listed in
 *     `packages/cerebrum-db/migrations/meta/_journal.json` is applied
 *     via drizzle's built-in migrator (idempotent — re-running against
 *     the same DB short-circuits on the `__drizzle_migrations` hash
 *     check).
 *
 * If the migration apply throws (corrupt DB, malformed migration,
 * missing folder), the raw handle is closed before the error is
 * re-thrown so the caller can't leak a locked file descriptor.
 */
export function openCerebrumDb(
  path: string,
  options: OpenCerebrumDbOptions = {}
): OpenedCerebrumDb {
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');

  const shouldLoadVec = options.loadVec !== false;
  const vecLoaded = shouldLoadVec ? tryLoadVecExtension(raw, options.logger) : false;

  const db = drizzle(raw) as CerebrumDb;
  try {
    migrate(db, { migrationsFolder: migrationsDir() });
  } catch (err) {
    raw.close();
    throw err;
  }

  const vecAvailable = vecLoaded && ensureAndProbeEmbeddingsVec(raw, options.logger);

  return { db, raw, vecAvailable };
}

/**
 * Create the `embeddings_vec` virtual table and probe it with a no-op
 * query to confirm the vec0 module is actually usable on this
 * connection. Returns `true` only when both the create and the probe
 * succeed — covers the case where the extension loads but the virtual
 * table can't be queried (module init error, name collision against a
 * non-vec0 table, etc.).
 */
function ensureAndProbeEmbeddingsVec(
  raw: Database.Database,
  logger: VecLoaderLogger | undefined
): boolean {
  if (!ensureEmbeddingsVecTable(raw)) {
    logger?.warn?.({}, '[cerebrum-db] embeddings_vec ensure failed — vector features disabled');
    return false;
  }
  try {
    raw.prepare('SELECT 1 FROM embeddings_vec LIMIT 0').all();
    return true;
  } catch (err) {
    logger?.warn?.(
      { err: (err as Error).message },
      '[cerebrum-db] embeddings_vec probe failed — vector features disabled'
    );
    return false;
  }
}
