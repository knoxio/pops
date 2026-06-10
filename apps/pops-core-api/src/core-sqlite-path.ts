import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the core pillar's SQLite path inside the
 * core-api container.
 *
 * Intentionally NOT imported from `apps/pops-api/src/db/core-sqlite-path.ts`
 * — core-api is supposed to be runnable without pops-api in the
 * dependency graph. The precedence chain mirrors pops-api's resolver
 * verbatim so the two processes agree on the location of `core.db`
 * given the same env: a deployer who only sets `SQLITE_PATH`
 * (legacy contract) still ends up with `core.db` next to `pops.db`.
 *
 * Resolution order:
 *   1. `CORE_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/core.db` if the shared path is set.
 *   3. `./data/core.db` (matches the shared default's `./data/pops.db`).
 */
export const DEFAULT_CORE_SQLITE_PATH = './data/core.db';

export function resolveCoreSqlitePath(): string {
  const envPath = process.env['CORE_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'core.db');
  return DEFAULT_CORE_SQLITE_PATH;
}
