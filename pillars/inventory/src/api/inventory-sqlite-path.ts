import { dirname, join } from 'node:path';

/**
 * Resolver for the inventory pillar's SQLite path.
 *
 * A deployer who only sets the shared `SQLITE_PATH` still gets
 * `inventory.db` resolved next to that path, so the pillar boots without
 * an inventory-specific env var.
 *
 * Resolution order:
 *   1. `INVENTORY_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/inventory.db` if the shared path is set.
 *   3. `./data/inventory.db`.
 */
export const DEFAULT_INVENTORY_SQLITE_PATH = './data/inventory.db';

export function resolveInventorySqlitePath(): string {
  const envPath = process.env['INVENTORY_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'inventory.db');
  return DEFAULT_INVENTORY_SQLITE_PATH;
}
