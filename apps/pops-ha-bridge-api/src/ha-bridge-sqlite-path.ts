import { dirname, join } from 'node:path';

/**
 * Resolver for the HA bridge pillar's SQLite path. Mirrors the
 * per-pillar resolver convention used by finance-api / lists-api /
 * media-api so a deployer who only sets `SQLITE_PATH` still ends up
 * with `ha-bridge.db` next to the other pillar files.
 *
 * Resolution order:
 *   1. `HA_BRIDGE_SQLITE_PATH` (absolute or relative)
 *   2. `<dirname(SQLITE_PATH)>/ha-bridge.db` if the shared path is set
 *   3. `./data/ha-bridge.db`
 */
export const DEFAULT_HA_BRIDGE_SQLITE_PATH = './data/ha-bridge.db';

export function resolveHaBridgeSqlitePath(): string {
  const envPath = process.env['HA_BRIDGE_SQLITE_PATH'];
  if (envPath !== undefined && envPath !== '') return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath !== undefined && sharedPath !== '') {
    return join(dirname(sharedPath), 'ha-bridge.db');
  }
  return DEFAULT_HA_BRIDGE_SQLITE_PATH;
}
