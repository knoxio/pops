import { dirname, join } from 'node:path';

/**
 * Resolver for the lists pillar's SQLite path.
 *
 * `SQLITE_PATH` is honoured (a deployer who sets only the shared path
 * still lands `lists.db` in that directory) so a single env can point a
 * whole fleet at one data dir without per-pillar overrides.
 *
 * Resolution order:
 *   1. `LISTS_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/lists.db` if the shared path is set.
 *   3. `./data/lists.db`.
 */
export const DEFAULT_LISTS_SQLITE_PATH = './data/lists.db';

export function resolveListsSqlitePath(): string {
  const envPath = process.env['LISTS_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'lists.db');
  return DEFAULT_LISTS_SQLITE_PATH;
}
