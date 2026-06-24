/**
 * Update-payload builder for the items service.
 *
 * - `undefined` means "leave unchanged" (the key is not written)
 * - `null` means "clear the field" (the key is written as null)
 */
import type { homeInventory } from '../schema.js';
import type { UpdateItemInput } from './items-types.js';

type InventoryUpdate = Partial<typeof homeInventory.$inferInsert>;

const NULLABLE_STRING_KEYS = [
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
] as const satisfies ReadonlyArray<keyof UpdateItemInput & keyof InventoryUpdate>;

const NULLABLE_NUMBER_KEYS = [
  'replacementValue',
  'resaleValue',
  'purchasePrice',
] as const satisfies ReadonlyArray<keyof UpdateItemInput & keyof InventoryUpdate>;

function assignItemName(updates: InventoryUpdate, input: UpdateItemInput): boolean {
  if (input.itemName === undefined) return false;
  updates.itemName = input.itemName;
  return true;
}

function assignNullableStringKeys(updates: InventoryUpdate, input: UpdateItemInput): boolean {
  let touched = false;
  for (const key of NULLABLE_STRING_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    updates[key] = value ?? null;
    touched = true;
  }
  return touched;
}

function assignNullableNumberKeys(updates: InventoryUpdate, input: UpdateItemInput): boolean {
  let touched = false;
  for (const key of NULLABLE_NUMBER_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    updates[key] = value ?? null;
    touched = true;
  }
  return touched;
}

function assignBooleanFlags(updates: InventoryUpdate, input: UpdateItemInput): boolean {
  let touched = false;
  if (input.inUse !== undefined) {
    updates.inUse = input.inUse ? 1 : 0;
    touched = true;
  }
  if (input.deductible !== undefined) {
    updates.deductible = input.deductible ? 1 : 0;
    touched = true;
  }
  return touched;
}

/**
 * Build the partial update payload for an inventory item.
 * Returns `null` when the caller supplied no fields — callers skip the DB write.
 */
export function buildUpdateValues(input: UpdateItemInput): InventoryUpdate | null {
  const updates: InventoryUpdate = {};
  let touched = false;

  if (assignItemName(updates, input)) touched = true;
  if (assignNullableStringKeys(updates, input)) touched = true;
  if (assignNullableNumberKeys(updates, input)) touched = true;
  if (assignBooleanFlags(updates, input)) touched = true;

  if (!touched) return null;
  updates.lastEditedTime = new Date().toISOString();
  return updates;
}
