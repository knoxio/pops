/**
 * Lazily-initialised handle to the inventory pillar's SQLite file.
 *
 * Phase 2 PR 2 of the inventory pillar migration: opens the connection
 * (and applies the in-package migrations journal) at boot but does NOT
 * yet route any production traffic through it. PR 3 of phase 2 flips
 * locations + items + uri-handler callers over with a single edit to
 * `getDrizzle()` → `getInventoryDrizzle()`; PR 4 drops the inventory
 * tables from the shared journal + adds the Litestream config.
 *
 * Lives in its own module so `db.ts` stays under the lint cap as more
 * pillars come online. Mirrors the eventual planned extraction of
 * `core-handle.ts` / `media-handle.ts` / ... once those pillars start
 * pulling their wiring out of the central file.
 */
import { openInventoryDb, type InventoryDb, type OpenedInventoryDb } from '@pops/inventory-db';

import { resolveInventorySqlitePath } from './inventory-sqlite-path.js';

let inventoryDb: OpenedInventoryDb | null = null;

/**
 * Resolve (and lazily open) the inventory pillar's drizzle handle.
 *
 * The handle is opened here on first call so the per-pillar migrations
 * apply at boot. Phase 2 PR 2 does NOT yet route any production traffic
 * through it — the existing shared singleton continues to serve every
 * read/write. The handle is here so PR 3 can flip locations + items +
 * uri-handler callers over with a one-line edit.
 */
export function getInventoryDrizzle(): InventoryDb {
  if (!inventoryDb) {
    inventoryDb = openInventoryDb(resolveInventorySqlitePath());
  }
  return inventoryDb.db;
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
