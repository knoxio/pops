/** Insert-payload builder for the items service. */
import type { homeInventory } from '../schema.js';
import type { CreateItemInput } from './items-types.js';

type InventoryInsert = typeof homeInventory.$inferInsert;

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
] as const satisfies ReadonlyArray<keyof CreateItemInput & keyof InventoryInsert>;

const CREATE_NULLABLE_NUMBER_KEYS = [
  'replacementValue',
  'resaleValue',
  'purchasePrice',
] as const satisfies ReadonlyArray<keyof CreateItemInput & keyof InventoryInsert>;

function nullableStringsFromInput(input: CreateItemInput): Partial<InventoryInsert> {
  const out: Partial<InventoryInsert> = {};
  for (const key of CREATE_NULLABLE_STRING_KEYS) {
    out[key] = input[key] ?? null;
  }
  return out;
}

function nullableNumbersFromInput(input: CreateItemInput): Partial<InventoryInsert> {
  const out: Partial<InventoryInsert> = {};
  for (const key of CREATE_NULLABLE_NUMBER_KEYS) {
    out[key] = input[key] ?? null;
  }
  return out;
}

/** Build the insert payload for a new inventory item. */
export function buildCreateValues(
  id: string,
  now: string,
  input: CreateItemInput
): InventoryInsert {
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
