import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the cerebrum pillar's SQLite path inside the
 * cerebrum-api container.
 *
 * Intentionally NOT imported from `apps/pops-api/src/db/cerebrum-sqlite-path.ts`
 * — cerebrum-api is supposed to be runnable without pops-api in the
 * dependency graph. The precedence chain matches pops-api's resolver
 * so the two processes agree on the location of `cerebrum.db` given
 * the same env: a deployer who only sets `SQLITE_PATH` (legacy
 * contract) still ends up with `cerebrum.db` next to `pops.db`. The
 * pops-api version emits a `console.warn` on the fallback branch
 * (its job is to flag dev/test setups that haven't been configured);
 * here we stay silent because a missing env in a per-pillar container
 * usually means the deployer set the default deliberately, and the
 * container has no equivalent dev-time signal to surface.
 *
 * Resolution order:
 *   1. `CEREBRUM_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/cerebrum.db` if the shared path is set.
 *   3. `./data/cerebrum.db` (matches the shared default's `./data/pops.db`).
 *
 * Mirrors core-api / inventory-api / media-api / finance-api resolvers.
 */
export const DEFAULT_CEREBRUM_API_SQLITE_PATH = './data/cerebrum.db';

export function resolveCerebrumSqlitePath(): string {
  const envPath = process.env['CEREBRUM_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'cerebrum.db');
  return DEFAULT_CEREBRUM_API_SQLITE_PATH;
}
