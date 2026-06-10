import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the inventory pillar's SQLite path inside the
 * inventory-api container.
 *
 * Intentionally NOT imported from
 * `apps/pops-api/src/db/inventory-sqlite-path.ts` — inventory-api is
 * supposed to be runnable without pops-api in the dependency graph.
 * The precedence chain mirrors pops-api's resolver verbatim so the two
 * processes agree on the location of `inventory.db` given the same
 * env: a deployer who only sets `SQLITE_PATH` (legacy contract) still
 * ends up with `inventory.db` next to `pops.db`.
 *
 * Resolution order:
 *   1. `INVENTORY_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/inventory.db` if the shared path is set.
 *   3. `./data/inventory.db` (matches the shared default's `./data/pops.db`).
 */
export const DEFAULT_INVENTORY_SQLITE_PATH = './data/inventory.db';

export function resolveInventorySqlitePath(): string {
  const envPath = process.env['INVENTORY_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'inventory.db');
  return DEFAULT_INVENTORY_SQLITE_PATH;
}
