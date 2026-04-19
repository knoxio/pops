import type { homeInventory } from '@pops/db-types';

import type { UpdateInventoryItemInput } from './types.js';

type InventoryUpdate = Partial<typeof homeInventory.$inferInsert>;

/**
 * Keys where we pass through string|null.
 *
 * - `undefined` means "leave unchanged" (the key is not written to the update payload)
 * - `null` means "clear the field" (the key is written with a null value)
 */
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
] as const satisfies ReadonlyArray<keyof UpdateInventoryItemInput & keyof InventoryUpdate>;

const NULLABLE_NUMBER_KEYS = ['replacementValue', 'resaleValue'] as const satisfies ReadonlyArray<
  keyof UpdateInventoryItemInput & keyof InventoryUpdate
>;

/**
 * Build the partial update payload for an inventory item from the input.
 * Returns `null` when the caller supplied no fields — so callers can skip the DB write.
 */
export function buildInventoryUpdate(input: UpdateInventoryItemInput): InventoryUpdate | null {
  const updates: InventoryUpdate = {};
  let touched = false;

  if (assignItemName(updates, input)) touched = true;
  if (assignNullableKeys(updates, input, NULLABLE_STRING_KEYS)) touched = true;
  if (assignNullableKeys(updates, input, NULLABLE_NUMBER_KEYS)) touched = true;
  if (assignBooleanFlags(updates, input)) touched = true;

  if (!touched) return null;
  updates.lastEditedTime = new Date().toISOString();
  return updates;
}

function assignItemName(updates: InventoryUpdate, input: UpdateInventoryItemInput): boolean {
  if (input.itemName === undefined) return false;
  updates.itemName = input.itemName;
  return true;
}

function assignNullableKeys(
  updates: InventoryUpdate,
  input: UpdateInventoryItemInput,
  keys: ReadonlyArray<keyof UpdateInventoryItemInput & keyof InventoryUpdate>
): boolean {
  let touched = false;
  for (const key of keys) {
    const value = input[key];
    if (value === undefined) continue;
    (updates as Record<string, unknown>)[key] = value ?? null;
    touched = true;
  }
  return touched;
}

function assignBooleanFlags(updates: InventoryUpdate, input: UpdateInventoryItemInput): boolean {
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
