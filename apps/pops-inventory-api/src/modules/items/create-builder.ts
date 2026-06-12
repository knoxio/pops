import type { homeInventory } from '@pops/inventory-db';

import type { CreateInventoryItemInput } from './types.js';

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

/** Build the insert payload for a new inventory item. */
export function buildCreateValues(
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
