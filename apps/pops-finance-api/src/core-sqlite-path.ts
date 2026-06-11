import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the shared `core.db` path inside the
 * finance-api container.
 *
 * Intentionally NOT imported from `apps/pops-api/src/db/core-sqlite-path.ts`
 * (or from `apps/pops-core-api/src/core-sqlite-path.ts`) — finance-api
 * is supposed to be runnable without either of those packages in its
 * dependency graph. The precedence chain mirrors the other resolvers
 * verbatim so every process agrees on the location of `core.db` given
 * the same env: a deployer who only sets `SQLITE_PATH` (legacy
 * contract) still ends up with `core.db` next to `pops.db`.
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
