import type { InventoryRow } from '@pops/db-types';
import { z } from 'zod';

export type { InventoryRow };

/** API response shape (camelCase). */
export interface InventoryItem {
  id: string;
  itemName: string;
  brand: string | null;
  model: string | null;
  itemId: string | null;
  room: string | null;
  location: string | null;
  type: string | null;
  condition: string | null;
  inUse: boolean;
  deductible: boolean;
  purchaseDate: string | null;
  warrantyExpires: string | null;
  replacementValue: number | null;
  resaleValue: number | null;
  purchasePrice: number | null;
  purchaseTransactionId: string | null;
  purchasedFromId: string | null;
  purchasedFromName: string | null;
  assetId: string | null;
  notes: string | null;
  locationId: string | null;
  lastEditedTime: string;
}

/** Map a SQLite row to the API response shape. */
export function toInventoryItem(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    itemName: row.itemName,
    brand: row.brand,
    model: row.model,
    itemId: row.itemId,
    room: row.room,
    location: row.location,
    type: row.type,
    condition: row.condition,
    inUse: row.inUse === 1,
    deductible: row.deductible === 1,
    purchaseDate: row.purchaseDate,
    warrantyExpires: row.warrantyExpires,
    replacementValue: row.replacementValue,
    resaleValue: row.resaleValue,
    purchasePrice: row.purchasePrice,
    purchaseTransactionId: row.purchaseTransactionId,
    purchasedFromId: row.purchasedFromId,
    purchasedFromName: row.purchasedFromName,
    assetId: row.assetId,
    notes: row.notes,
    locationId: row.locationId,
    lastEditedTime: row.lastEditedTime,
  };
}

/** Zod schema for creating an inventory item. */
export const CreateInventoryItemSchema = z.object({
  itemName: z.string().min(1, 'Item name is required'),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  itemId: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  inUse: z.boolean().optional().default(false),
  deductible: z.boolean().optional().default(false),
  purchaseDate: z.string().nullable().optional(),
  warrantyExpires: z.string().nullable().optional(),
  replacementValue: z.number().nullable().optional(),
  resaleValue: z.number().nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  purchaseTransactionId: z.string().nullable().optional(),
  purchasedFromId: z.string().nullable().optional(),
  purchasedFromName: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
});
export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>;

/** Zod schema for updating an inventory item (all fields optional). */
export const UpdateInventoryItemSchema = z.object({
  itemName: z.string().min(1, 'Item name cannot be empty').optional(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  itemId: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  inUse: z.boolean().optional(),
  deductible: z.boolean().optional(),
  purchaseDate: z.string().nullable().optional(),
  warrantyExpires: z.string().nullable().optional(),
  replacementValue: z.number().nullable().optional(),
  resaleValue: z.number().nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  purchaseTransactionId: z.string().nullable().optional(),
  purchasedFromId: z.string().nullable().optional(),
  purchasedFromName: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
});
export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemSchema>;

/** Zod schema for inventory list query params. */
export const InventoryQuerySchema = z.object({
  search: z.string().optional(),
  room: z.string().optional(),
  type: z.string().optional(),
  condition: z.string().optional(),
  inUse: z.enum(['true', 'false']).optional(),
  deductible: z.enum(['true', 'false']).optional(),
  locationId: z.string().optional(),
  includeChildren: z.boolean().optional().default(false),
  assetId: z.string().optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type InventoryQuery = z.infer<typeof InventoryQuerySchema>;
