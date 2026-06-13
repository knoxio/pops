/**
 * Inventory items read/write surface — PRD-173 PR 3 cutover.
 *
 * Reads (PR 2) and writes (PR 3) now both route through `itemsService`
 * from `@pops/inventory-db` against the inventory pillar handle
 * (`getInventoryDrizzle()`):
 *  - `listInventoryItems`, `getInventoryItem`, `searchByAssetId`,
 *    `countByAssetPrefix`, `getDistinctTypes`.
 *  - `createInventoryItem`, `updateInventoryItem`,
 *    `deleteInventoryItem`.
 *
 * The inline drizzle statements (and the local `buildInventoryUpdate`
 * helper) are gone — the canonical implementation lives in the
 * `@pops/inventory-db` package, so any future write-shape change
 * happens in one place.
 *
 * The legacy router stays mounted in pops-api as a fall-through while
 * the dispatcher cutover routes `inventory.items.*` traffic to
 * pops-inventory-api. Consumers (router.ts here, plus the package
 * barrel re-export in `./index.ts`) keep the same wire surface — no
 * caller churn.
 *
 * @deprecated Theme 13 PRD-173 PR 1 — writer moved to
 * `apps/pops-inventory-api/src/modules/items/service.ts`. Legacy mount
 * stays for fall-through traffic until the slice's dispatcher cutover.
 */
import { ItemNotFoundError, itemsService } from '@pops/inventory-db';

import { getInventoryDrizzle } from '../../../db/inventory-handle.js';
import { NotFoundError } from '../../../shared/errors.js';

import type { CreateInventoryItemInput, InventoryRow, UpdateInventoryItemInput } from './types.js';

/** Count + rows + value aggregates for a paginated list. */
export interface InventoryListResult {
  rows: InventoryRow[];
  total: number;
  totalReplacementValue: number;
  totalResaleValue: number;
}

/** Options for listing inventory items. */
export interface ListInventoryItemsOptions {
  search?: string;
  room?: string;
  type?: string;
  condition?: string;
  inUse?: boolean;
  deductible?: boolean;
  limit: number;
  offset: number;
  locationId?: string;
  assetId?: string;
  includeChildren?: boolean;
}

function translate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ItemNotFoundError) {
      throw new NotFoundError('Inventory item', err.id);
    }
    throw err;
  }
}

/** List inventory items with optional filters. */
export function listInventoryItems(opts: ListInventoryItemsOptions): InventoryListResult {
  return itemsService.list(getInventoryDrizzle(), opts);
}

/**
 * Search for an inventory item by exact asset ID (case-insensitive).
 * Returns the item or null if not found.
 */
export function searchByAssetId(assetId: string): InventoryRow | null {
  return itemsService.searchByAssetId(getInventoryDrizzle(), assetId);
}

/**
 * Count inventory items whose assetId starts with the given prefix (case-insensitive).
 */
export function countByAssetPrefix(prefix: string): number {
  return itemsService.countByAssetPrefix(getInventoryDrizzle(), prefix);
}

/** Return distinct item types that exist in the database. */
export function getDistinctTypes(): string[] {
  return itemsService.distinctTypes(getInventoryDrizzle());
}

/** Get a single inventory item by id. Throws NotFoundError if missing. */
export function getInventoryItem(id: string): InventoryRow {
  return translate(() => itemsService.get(getInventoryDrizzle(), id));
}

/** Create a new inventory item. Returns the created row. */
export function createInventoryItem(input: CreateInventoryItemInput): InventoryRow {
  return itemsService.create(getInventoryDrizzle(), input);
}

/** Update an existing inventory item. Returns the updated row. */
export function updateInventoryItem(id: string, input: UpdateInventoryItemInput): InventoryRow {
  return translate(() => itemsService.update(getInventoryDrizzle(), id, input));
}

/** Delete an inventory item by ID. Throws NotFoundError if missing. */
export function deleteInventoryItem(id: string): void {
  translate(() => itemsService.delete(getInventoryDrizzle(), id));
}
