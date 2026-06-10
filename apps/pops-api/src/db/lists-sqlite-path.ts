import { dirname, join } from 'node:path';

import { DEFAULT_SQLITE_PATH } from './sqlite-path.js';

/**
 * Default location of the lists pillar's SQLite file.
 *
 * Per the ADR-026 pillar architecture each pillar owns its own SQLite
 * file alongside the shared pops.db. The default places `lists.db`
 * in the same directory the shared singleton resolves to so dev setups
 * that already have a writable data dir don't need extra configuration.
 * Production deployments set `LISTS_SQLITE_PATH` explicitly; the
 * fallback here is local-dev-only and matches `resolveSqlitePath`'s
 * default-path convention (`./data/<file>.db`).
 *
 * Resolution order:
 *   1. `LISTS_SQLITE_PATH` env (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/lists.db` if the shared path is set.
 *   3. `./data/lists.db` (matches the shared default's `./data/pops.db`).
 */
export const DEFAULT_LISTS_SQLITE_PATH = './data/lists.db';

export function resolveListsSqlitePath(): string {
  const envPath = process.env['LISTS_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'lists.db');
  console.warn(
    `[db] LISTS_SQLITE_PATH not set — using fallback: ${DEFAULT_LISTS_SQLITE_PATH} ` +
      `(co-located with the shared singleton default '${DEFAULT_SQLITE_PATH}')`
  );
  return DEFAULT_LISTS_SQLITE_PATH;
}
