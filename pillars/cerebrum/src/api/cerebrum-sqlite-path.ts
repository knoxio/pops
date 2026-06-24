import { dirname, join } from 'node:path';

/**
 * Resolver for the cerebrum pillar's SQLite path.
 *
 * Resolution order:
 *   1. `CEREBRUM_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/cerebrum.db` if `SQLITE_PATH` is set.
 *   3. `./data/cerebrum.db`.
 */
export const DEFAULT_CEREBRUM_SQLITE_PATH = './data/cerebrum.db';

export function resolveCerebrumSqlitePath(): string {
  const envPath = process.env['CEREBRUM_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'cerebrum.db');
  return DEFAULT_CEREBRUM_SQLITE_PATH;
}
