/**
 * Lazily-initialised handle to the food pillar's SQLite file.
 *
 * Phase 2 PR 2 of the food pillar migration: opens the connection
 * (and applies the in-package migrations journal) at boot but does NOT
 * yet route any production traffic through it. PR 3 of phase 2 flips
 * the prep_states slice (and subsequent slices) over with a single
 * edit to `getDrizzle()` → `getFoodDrizzle()` plus an ATTACH-based
 * backfill of any existing rows from the shared pops.db; PR 4 drops
 * the food-owned tags from the shared journal + adds the Litestream
 * config.
 *
 * Lives in its own module so `db.ts` stays under the lint cap as more
 * pillars come online. Mirrors `core-handle.ts` / `inventory-handle.ts` /
 * `finance-handle.ts` / `media-db-handle.ts` / `cerebrum-handle.ts`.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { openFoodDb, type FoodDb, type OpenedFoodDb } from '@pops/food-db';

import { getDb, isNamedEnvContext } from '../db.js';
import { resolveFoodSqlitePath } from './food-sqlite-path.js';

let foodDb: OpenedFoodDb | null = null;

/**
 * Resolve (and lazily open) the food pillar's drizzle handle.
 *
 * **Env-aware**: inside a `withEnvDb()` scope (PRD-101 named environments —
 * each E2E test fixture creates a per-test pops.db with its own seeded
 * food tables) the env DB takes precedence. The env DB already contains
 * every food-owned table because `seedDatabase()` writes them there, so
 * a single fixture stays self-contained without a background backfill
 * into the global `food.db`. Outside an env scope (real production
 * boot, dev), the pillar's `food.db` is resolved + lazily opened so
 * the in-package migrations apply.
 *
 * The handle is opened on first call so per-pillar migrations land
 * before any request hits the API. Phase 2 PR 3 routes the prep_states
 * slice's reads/writes through this getter.
 */
export function getFoodDrizzle(): FoodDb {
  if (isNamedEnvContext()) return drizzle(getDb()) as FoodDb;
  if (!foodDb) {
    foodDb = openFoodDb(resolveFoodSqlitePath());
  }
  return foodDb.db;
}

/**
 * Resolve the food pillar's raw better-sqlite3 handle. Same lazy
 * open + env-aware behaviour as `getFoodDrizzle()` — exposed for
 * the same lower-level needs (`.transaction()`, `.prepare()`,
 * `.pragma()`) that the drizzle wrapper hides. Prefer
 * `getFoodDrizzle()` for everything that doesn't need it.
 */
export function getFoodRawDb(): OpenedFoodDb['raw'] {
  if (isNamedEnvContext()) return getDb();
  if (!foodDb) {
    foodDb = openFoodDb(resolveFoodSqlitePath());
  }
  return foodDb.raw;
}

/**
 * Close the food pillar's connection if it was opened. Idempotent
 * — safe to call from `closeDb()` on shutdown even when the food
 * handle was never resolved.
 */
export function closeFoodDb(): void {
  if (foodDb) {
    foodDb.raw.close();
    foodDb = null;
  }
}

/**
 * Test-only: swap the food pillar handle. `setupTestContext` in
 * `shared/test-utils.ts` calls this hook so test suites can inject an
 * in-memory DB and avoid writing to the dev `data/food.db` file.
 * Returns the previous handle (or null).
 */
export function setFoodDb(next: OpenedFoodDb | null): OpenedFoodDb | null {
  const prev = foodDb;
  foodDb = next;
  return prev;
}
