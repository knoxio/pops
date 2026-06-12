/**
 * Input and result types for the items service.
 *
 * Validation (zod) and the API response mapper live with the router
 * layers — this package stays HTTP-agnostic and only exposes the
 * service surface and row types needed to call it.
 */
import type { InventoryRow } from '@pops/db-types';

export type { InventoryRow };

/** Input for creating a new inventory item. */
export interface CreateItemInput {
  itemName: string;
  brand?: string | null;
  model?: string | null;
  itemId?: string | null;
  room?: string | null;
  location?: string | null;
  type?: string | null;
  condition?: string | null;
  inUse?: boolean;
  deductible?: boolean;
  purchaseDate?: string | null;
  warrantyExpires?: string | null;
  replacementValue?: number | null;
  resaleValue?: number | null;
  purchasePrice?: number | null;
  purchaseTransactionId?: string | null;
  purchasedFromId?: string | null;
  purchasedFromName?: string | null;
  assetId?: string | null;
  notes?: string | null;
  locationId?: string | null;
}

/** Input for updating an existing inventory item — all fields optional. */
export interface UpdateItemInput {
  itemName?: string;
  brand?: string | null;
  model?: string | null;
  itemId?: string | null;
  room?: string | null;
  location?: string | null;
  type?: string | null;
  condition?: string | null;
  inUse?: boolean;
  deductible?: boolean;
  purchaseDate?: string | null;
  warrantyExpires?: string | null;
  replacementValue?: number | null;
  resaleValue?: number | null;
  purchasePrice?: number | null;
  purchaseTransactionId?: string | null;
  purchasedFromId?: string | null;
  purchasedFromName?: string | null;
  assetId?: string | null;
  notes?: string | null;
  locationId?: string | null;
}

/** Filters for listing inventory items. */
export interface ItemFilters {
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

/** Paginated list result with value aggregates. */
export interface ItemListResult {
  rows: InventoryRow[];
  total: number;
  totalReplacementValue: number;
  totalResaleValue: number;
}

/** Public API shape for an inventory item (camelCase, booleans normalised). */
export interface Item {
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

/** Map a SQLite row to the public API shape. */
export function toItem(row: InventoryRow): Item {
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
