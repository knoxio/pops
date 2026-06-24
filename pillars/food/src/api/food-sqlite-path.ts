import { dirname, join } from 'node:path';

/**
 * Resolves the food pillar's SQLite path.
 *
 * Resolution order:
 *   1. `FOOD_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/food.db` if the shared path is set, so a
 *      deployer who only sets `SQLITE_PATH` still gets a sibling `food.db`.
 *   3. `./data/food.db`.
 */
export const DEFAULT_FOOD_SQLITE_PATH = './data/food.db';

export function resolveFoodSqlitePath(): string {
  const envPath = process.env['FOOD_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'food.db');
  return DEFAULT_FOOD_SQLITE_PATH;
}
