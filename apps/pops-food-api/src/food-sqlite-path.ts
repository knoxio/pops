import { dirname, join } from 'node:path';

/**
 * Standalone resolver for the food pillar's SQLite path inside the
 * food-api container.
 *
 * Intentionally NOT imported from `apps/pops-api/src/db/food-sqlite-path.ts`
 * — food-api is supposed to be runnable without pops-api in the
 * dependency graph. The precedence chain matches pops-api's resolver
 * so the two processes agree on the location of `food.db` given the
 * same env: a deployer who only sets `SQLITE_PATH` (legacy contract)
 * still ends up with `food.db` next to `pops.db`.
 *
 * Resolution order:
 *   1. `FOOD_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/food.db` if the shared path is set.
 *   3. `./data/food.db` (matches the shared default's `./data/pops.db`).
 *
 * Mirrors core-api / inventory-api / media-api / finance-api / cerebrum-api resolvers.
 */
export const DEFAULT_FOOD_SQLITE_PATH = './data/food.db';

export function resolveFoodSqlitePath(): string {
  const envPath = process.env['FOOD_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'food.db');
  return DEFAULT_FOOD_SQLITE_PATH;
}
