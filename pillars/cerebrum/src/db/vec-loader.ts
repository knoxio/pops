/**
 * sqlite-vec extension loader for the cerebrum pillar database.
 *
 * The module-level `vecAvailable` flag gates the one-time info log. The
 * extension binary is loaded once per process by `sqlite-vec`; calling
 * `load` on multiple connections is safe.
 *
 * The `embeddings_vec` virtual table is cerebrum-owned and the only
 * consumer of `vec_*` SQL, so the loader stays colocated with
 * `openCerebrumDb`.
 */
import * as sqliteVec from 'sqlite-vec';

import type BetterSqlite3 from 'better-sqlite3';

let vecAvailable = false;

export function isVecAvailable(): boolean {
  return vecAvailable;
}

export interface VecLoaderLogger {
  info?: (payload: unknown, msg: string) => void;
  warn?: (payload: unknown, msg: string) => void;
}

/**
 * Try to load the sqlite-vec extension into `raw`. Returns `true` on
 * success, `false` if the extension can't be loaded (binary missing,
 * platform unsupported, etc.). Failures are non-fatal — callers that
 * need vector search should branch on the return value or surface a
 * domain-level error; non-vector consumers (engram CRUD, scopes, tags,
 * links) all work without it.
 *
 * Does not throw. Logs at most one warning per process via the optional
 * logger argument.
 */
export function tryLoadVecExtension(
  raw: BetterSqlite3.Database,
  logger?: VecLoaderLogger
): boolean {
  try {
    sqliteVec.load(raw);
    if (!vecAvailable) {
      const version = raw.prepare('SELECT vec_version()').pluck().get() as string;
      logger?.info?.({ version }, '[cerebrum-db] sqlite-vec loaded');
      vecAvailable = true;
    }
    return true;
  } catch (err) {
    if (!vecAvailable) {
      logger?.warn?.(
        { err: (err as Error).message },
        '[cerebrum-db] sqlite-vec failed to load — vector features disabled'
      );
    }
    return false;
  }
}

/**
 * Idempotent creation of the `embeddings_vec` virtual table. Skipped
 * with a swallowed error when sqlite-vec hasn't been loaded — that path
 * is the right one for unit tests and any cerebrum-owned consumer that
 * doesn't need vector search. The dimension is fixed at 1536
 * (text-embedding-3-small) to match the shared baseline; changing it
 * requires a full re-embed.
 */
export function ensureEmbeddingsVecTable(raw: BetterSqlite3.Database): boolean {
  try {
    raw.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS embeddings_vec USING vec0(vector float[1536])`);
    return true;
  } catch {
    return false;
  }
}
