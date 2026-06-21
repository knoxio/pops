import type { ItemFormValues } from './types';

export interface ItemRecord {
  itemName: string;
  brand: string | null;
  model: string | null;
  itemId: string | null;
  type: string | null;
  condition: string | null;
  locationId: string | null;
  inUse: boolean;
  deductible: boolean;
  purchaseDate: string | null;
  warrantyExpires: string | null;
  purchasePrice: number | null;
  replacementValue: number | null;
  resaleValue: number | null;
  assetId: string | null;
  notes: string | null;
}

export interface ItemQueryResult {
  data?: ItemRecord;
}

function s(v: string | null | undefined): string {
  return v ?? '';
}

/** Normalise a stored condition value to title-case so it matches the select options. */
function normalizeCondition(v: string | null | undefined): string {
  const raw = v ?? '';
  if (!raw) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function n(v: number | null | undefined): string {
  return v?.toString() ?? '';
}

export function itemToFormValues(item: ItemRecord): ItemFormValues {
  return {
    itemName: item.itemName,
    brand: s(item.brand),
    model: s(item.model),
    itemId: s(item.itemId),
    type: s(item.type),
    condition: normalizeCondition(item.condition),
    locationId: s(item.locationId),
    inUse: item.inUse,
    deductible: item.deductible,
    purchaseDate: s(item.purchaseDate),
    warrantyExpires: s(item.warrantyExpires),
    purchasePrice: n(item.purchasePrice),
    replacementValue: n(item.replacementValue),
    resaleValue: n(item.resaleValue),
    assetId: s(item.assetId),
    notes: s(item.notes),
  };
}
