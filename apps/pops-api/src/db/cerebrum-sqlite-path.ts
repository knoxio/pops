import { dirname, join } from 'node:path';

import { DEFAULT_SQLITE_PATH } from './sqlite-path.js';

/**
 * Default location of the cerebrum pillar's SQLite file.
 *
 * Per the ADR-026 pillar architecture each pillar owns its own SQLite
 * file alongside the shared pops.db. The default places `cerebrum.db`
 * in the same directory the shared singleton resolves to so dev setups
 * that already have a writable data dir don't need extra configuration.
 * Production deployments set `CEREBRUM_SQLITE_PATH` explicitly; the
 * fallback here is local-dev-only and matches `resolveSqlitePath`'s
 * default-path convention (`./data/<file>.db`).
 *
 * Resolution order:
 *   1. `CEREBRUM_SQLITE_PATH` env (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/cerebrum.db` if the shared path is set.
 *   3. `./data/cerebrum.db` (matches the shared default's `./data/pops.db`).
 */
export const DEFAULT_CEREBRUM_SQLITE_PATH = './data/cerebrum.db';

export function resolveCerebrumSqlitePath(): string {
  const envPath = process.env['CEREBRUM_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'cerebrum.db');
  console.warn(
    `[db] CEREBRUM_SQLITE_PATH not set — using fallback: ${DEFAULT_CEREBRUM_SQLITE_PATH} ` +
      `(co-located with the shared singleton default '${DEFAULT_SQLITE_PATH}')`
  );
  return DEFAULT_CEREBRUM_SQLITE_PATH;
}
