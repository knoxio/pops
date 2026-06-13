/**
 * Lazily-initialised handle to the inventory pillar's SQLite file.
 *
 * Phase 2 PR 2 opened the connection (and applied the in-package
 * migrations journal) at boot. PR 3 routed every inventory module
 * read/write through `getInventoryDrizzle()` and ran a one-shot
 * ATTACH-based backfill from the legacy shared pops.db. PR 4 (Theme 13)
 * retired the backfill — every inventory-owned table now writes
 * directly to inventory.db, so the boot bridge has nothing left to
 * carry forward.
 *
 * Lives in its own module so `db.ts` stays under the lint cap as more
 * pillars come online. Mirrors the eventual planned extraction of
 * `core-handle.ts` / `media-handle.ts` / ... once those pillars start
 * pulling their wiring out of the central file.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { openInventoryDb, type InventoryDb, type OpenedInventoryDb } from '@pops/inventory-db';

import { getDb, isNamedEnvContext } from '../db.js';
import { resolveInventorySqlitePath } from './inventory-sqlite-path.js';

let inventoryDb: OpenedInventoryDb | null = null;

/**
 * Resolve (and lazily open) the inventory pillar's drizzle handle.
 *
 * **Env-aware**: inside a `withEnvDb()` scope (PRD-101 named environments —
 * each E2E test fixture creates a per-test pops.db with its own seeded
 * inventory tables) the env DB takes precedence. The env DB already
 * contains every inventory-owned table because `seedDatabase()` writes
 * them there, so a single fixture stays self-contained without a
 * background backfill into the global `inventory.db`. Outside an env
 * scope (real production boot, dev), the pillar's `inventory.db` is
 * resolved + lazily opened so the in-package migrations apply.
 *
 * The handle is opened on first call so per-pillar migrations land
 * before any request hits the API. Phase 2 PR 3 routes every inventory
 * module read/write through this getter.
 */
export function getInventoryDrizzle(): InventoryDb {
  if (isNamedEnvContext()) return drizzle(getDb()) as InventoryDb;
  if (!inventoryDb) {
    inventoryDb = openInventoryDb(resolveInventorySqlitePath());
  }
  return inventoryDb.db;
}

/**
 * Resolve the inventory pillar's raw better-sqlite3 handle. Same lazy
 * open + env-aware behaviour as `getInventoryDrizzle()` — the drizzle
 * wrapper hides `.transaction()` / `.prepare()` / `.pragma()` which a
 * handful of inventory module call sites still need (e.g.
 * `photos.reorderPhotos` wraps a batch update in a better-sqlite3
 * transaction). Prefer `getInventoryDrizzle()` for everything that
 * doesn't need that lower-level API.
 */
export function getInventoryRawDb(): OpenedInventoryDb['raw'] {
  if (isNamedEnvContext()) return getDb();
  if (!inventoryDb) {
    inventoryDb = openInventoryDb(resolveInventorySqlitePath());
  }
  return inventoryDb.raw;
}

/**
 * Close the inventory pillar's connection if it was opened. Idempotent
 * — safe to call from `closeDb()` on shutdown even when the inventory
 * handle was never resolved.
 */
export function closeInventoryDb(): void {
  if (inventoryDb) {
    inventoryDb.raw.close();
    inventoryDb = null;
  }
}

/**
 * Test-only: swap the inventory pillar handle. Phase 2 PR 3 of this
 * pillar wires `setupTestContext` (in `shared/test-utils.ts`) up to
 * call this hook so test suites can inject an in-memory DB and avoid
 * writing to the dev `data/inventory.db` file. Returns the previous
 * handle (or null).
 */
export function setInventoryDb(next: OpenedInventoryDb | null): OpenedInventoryDb | null {
  const prev = inventoryDb;
  inventoryDb = next;
  return prev;
}
