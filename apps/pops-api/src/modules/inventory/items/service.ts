/**
 * Inventory items read/write surface — PRD-173 PR 2 cutover.
 *
 * Read/write split during the migration window (mirrors PRD-168 PR 2 +
 * PRD-179 PR 2):
 *  - `listInventoryItems`, `getInventoryItem`, `searchByAssetId`,
 *    `countByAssetPrefix`, `getDistinctTypes` are routed through
 *    `itemsService` from `@pops/inventory-db` against the inventory
 *    pillar handle (`getInventoryDrizzle()`). Reads now resolve from
 *    the canonical package implementation.
 *  - Writes (`createInventoryItem`, `updateInventoryItem`,
 *    `deleteInventoryItem`) keep their inline drizzle statements
 *    against the same handle to preserve the existing read-after-write
 *    guarantee against the inventory pillar's SQLite file. The pillar
 *    handle is the single store for inventory writes, so there is no
 *    cross-store TOCTOU to worry about; the inline writes stay in
 *    place until PRD-173 PR 3 collapses them onto `itemsService.*`.
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
import crypto from 'crypto';

import { eq } from 'drizzle-orm';

import { homeInventory } from '@pops/db-types';
import { ItemNotFoundError, itemsService } from '@pops/inventory-db';

import { getInventoryDrizzle } from '../../../db/inventory-handle.js';
import { NotFoundError } from '../../../shared/errors.js';
import { buildInventoryUpdate } from './update-builder.js';

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

function buildCreateValues(
  id: string,
  now: string,
  input: CreateInventoryItemInput
): typeof homeInventory.$inferInsert {
  return {
    id,
    itemName: input.itemName,
    inUse: input.inUse ? 1 : 0,
    deductible: input.deductible ? 1 : 0,
    lastEditedTime: now,
    ...nullableStringsFromInput(input),
    ...nullableNumbersFromInput(input),
  };
}

const CREATE_NULLABLE_STRING_KEYS = [
  'brand',
  'model',
  'itemId',
  'room',
  'location',
  'type',
  'condition',
  'purchaseDate',
  'warrantyExpires',
  'purchaseTransactionId',
  'purchasedFromId',
  'purchasedFromName',
  'assetId',
  'notes',
  'locationId',
] as const satisfies ReadonlyArray<
  keyof CreateInventoryItemInput & keyof typeof homeInventory.$inferInsert
>;

const CREATE_NULLABLE_NUMBER_KEYS = [
  'replacementValue',
  'resaleValue',
] as const satisfies ReadonlyArray<
  keyof CreateInventoryItemInput & keyof typeof homeInventory.$inferInsert
>;

function nullableStringsFromInput(
  input: CreateInventoryItemInput
): Partial<typeof homeInventory.$inferInsert> {
  const out: Record<string, unknown> = {};
  for (const key of CREATE_NULLABLE_STRING_KEYS) {
    out[key] = input[key] ?? null;
  }
  return out as Partial<typeof homeInventory.$inferInsert>;
}

function nullableNumbersFromInput(
  input: CreateInventoryItemInput
): Partial<typeof homeInventory.$inferInsert> {
  const out: Record<string, unknown> = {};
  for (const key of CREATE_NULLABLE_NUMBER_KEYS) {
    out[key] = input[key] ?? null;
  }
  return out as Partial<typeof homeInventory.$inferInsert>;
}

/**
 * Create a new inventory item. Returns the created row.
 * Generates a local UUID and inserts directly into SQLite.
 */
export function createInventoryItem(input: CreateInventoryItemInput): InventoryRow {
  const db = getInventoryDrizzle();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(homeInventory)
    .values(buildCreateValues(id, now, input))
    .run();

  return getInventoryItem(id);
}

/**
 * Update an existing inventory item. Returns the updated row.
 * Updates directly in SQLite.
 */
export function updateInventoryItem(id: string, input: UpdateInventoryItemInput): InventoryRow {
  getInventoryItem(id);

  const updates = buildInventoryUpdate(input);
  if (updates) {
    const db = getInventoryDrizzle();
    db.update(homeInventory).set(updates).where(eq(homeInventory.id, id)).run();
  }

  return getInventoryItem(id);
}

/**
 * Delete an inventory item by ID. Throws NotFoundError if missing.
 * Deletes directly from SQLite.
 */
export function deleteInventoryItem(id: string): void {
  getInventoryItem(id);

  const db = getInventoryDrizzle();
  const result = db.delete(homeInventory).where(eq(homeInventory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Inventory item', id);
}
