import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the lists pillar's SQLite path inside the
 * lists-api container.
 *
 * Intentionally NOT imported from `apps/pops-api/src/db/lists-sqlite-path.ts`
 * — lists-api is supposed to be runnable without pops-api in the
 * dependency graph. The precedence chain matches pops-api's resolver
 * so the two processes agree on the location of `lists.db` given the
 * same env: a deployer who only sets `SQLITE_PATH` (legacy contract)
 * still ends up with `lists.db` next to `pops.db`.
 *
 * Resolution order:
 *   1. `LISTS_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/lists.db` if the shared path is set.
 *   3. `./data/lists.db` (matches the shared default's `./data/pops.db`).
 *
 * Mirrors core-api / inventory-api / media-api / finance-api / cerebrum-api / food-api resolvers.
 */
export const DEFAULT_LISTS_SQLITE_PATH = './data/lists.db';

export function resolveListsSqlitePath(): string {
  const envPath = process.env['LISTS_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'lists.db');
  return DEFAULT_LISTS_SQLITE_PATH;
}
