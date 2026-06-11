/**
 * Inventory pillar handle smoke harness.
 *
 * Opens a fresh per-pillar `inventory.db` via `openInventoryDb(':memory:')`
 * and exercises every query under `appRouter.inventory.*`. Catches
 * `SqliteError: no such table` for cutovers that resolve through
 * `getInventoryDrizzle()`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '@pops/inventory-db';

import { closeDb, setDb } from '../../../db.js';
import { setInventoryDb } from '../../../db/inventory-handle.js';
import { appRouter } from '../../../router.js';
import {
  enumeratePillarQueries,
  runPillarSmokeHarness,
  type PillarSmokeInputs,
} from '../../../shared/pillar-smoke-harness.js';
import { createCaller, createTestDb } from '../../../shared/test-utils.js';

const INVENTORY_INPUTS: PillarSmokeInputs = {
  'inventory.items.searchByAssetId': { assetId: 'NOPE' },
  'inventory.items.countByAssetPrefix': { prefix: 'NOPE' },
  'inventory.items.get': { id: 'nonexistent-item-id' },
  'inventory.locations.get': { id: 'nonexistent-location-id' },
  'inventory.locations.getPath': { id: 'nonexistent-location-id' },
  'inventory.locations.getItems': { locationId: 'nonexistent-location-id' },
  'inventory.locations.children': { parentId: 'nonexistent-location-id' },
  'inventory.locations.deleteStats': { id: 'nonexistent-location-id' },
  'inventory.connections.listForItem': { itemId: 'nonexistent-item-id' },
  'inventory.connections.trace': { itemId: 'nonexistent-item-id' },
  'inventory.connections.graph': { itemId: 'nonexistent-item-id' },
  'inventory.fixtures.get': { id: 'nonexistent-fixture-id' },
  'inventory.fixtures.listForItem': { itemId: 'nonexistent-item-id' },
  'inventory.photos.listForItem': { itemId: 'nonexistent-item-id' },
  'inventory.documents.listForItem': { itemId: 'nonexistent-item-id' },
  'inventory.documentFiles.listForItem': { itemId: 'nonexistent-item-id' },
  'inventory.paperless.search': { query: 'smoke' },
};

let inventoryHandle: OpenedInventoryDb | null = null;

beforeEach(() => {
  setDb(createTestDb());
  inventoryHandle = openInventoryDb(':memory:');
  setInventoryDb(inventoryHandle);
});

afterEach(() => {
  setInventoryDb(null);
  inventoryHandle?.raw.close();
  inventoryHandle = null;
  closeDb();
});

describe('inventory pillar handle smoke harness', () => {
  it('enumerates at least one inventory query procedure (sanity)', () => {
    const queries = enumeratePillarQueries(appRouter, 'inventory');
    expect(queries.length).toBeGreaterThan(0);
  });

  it('every inventory query reaches its table on a fresh per-pillar DB', async () => {
    const caller = createCaller(true);
    const failures = await runPillarSmokeHarness(appRouter, caller, 'inventory', {
      inputs: INVENTORY_INPUTS,
    });

    if (failures.length > 0) {
      const detail = failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n');
      throw new Error(
        `Inventory pillar smoke harness found ${failures.length.toString()} ` +
          `"no such table" failure(s). The fresh per-pillar inventory.db ` +
          `is missing one or more tables that these procedures expect:\n${detail}`
      );
    }

    expect(failures).toEqual([]);
  });

  it('runs the entire inventory smoke pass quickly (<5s)', async () => {
    const caller = createCaller(true);
    const started = Date.now();
    await runPillarSmokeHarness(appRouter, caller, 'inventory', { inputs: INVENTORY_INPUTS });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5000);
  });
});
