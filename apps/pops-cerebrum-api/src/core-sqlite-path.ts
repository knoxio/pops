import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the core pillar's SQLite path as seen from
 * inside the cerebrum-api container.
 *
 * cerebrum-api needs its OWN open handle to `core.db` because the
 * `service_accounts` table that backs `X-API-Key` authentication lives
 * on the core pillar. The handle MUST be writable: auth touches
 * `service_accounts.last_used_at` on every request, and `openCoreDb`
 * applies the package-local migration journal at boot. Deployers
 * mounting `core.db` read-only will break both auth and boot.
 *
 * Intentionally NOT imported from `apps/pops-api/src/db/core-sqlite-path.ts`
 * — the per-pillar container is supposed to stand alone of pops-api in
 * the dependency graph. The precedence chain matches pops-api so both
 * processes agree on the location given the same env.
 *
 * Resolution order:
 *   1. `CORE_SQLITE_PATH` env (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/core.db` if the shared path is set.
 *   3. `./data/core.db` (matches the shared default's `./data/pops.db`).
 */
export const DEFAULT_CEREBRUM_API_CORE_SQLITE_PATH = './data/core.db';

export function resolveCoreSqlitePath(): string {
  const envPath = process.env['CORE_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'core.db');
  return DEFAULT_CEREBRUM_API_CORE_SQLITE_PATH;
}
