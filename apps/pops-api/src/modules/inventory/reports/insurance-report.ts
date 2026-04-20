import { asc, eq } from 'drizzle-orm';

import { homeInventory, itemDocuments, itemPhotos, locations } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

export interface InsuranceReportItem {
  id: string;
  itemName: string;
  assetId: string | null;
  brand: string | null;
  type: string | null;
  condition: string | null;
  warrantyExpires: string | null;
  replacementValue: number | null;
  photoPath: string | null;
  locationId: string | null;
  locationName: string | null;
  receiptDocumentIds: number[];
}

export interface InsuranceReportGroup {
  locationId: string | null;
  locationName: string;
  items: InsuranceReportItem[];
}

export interface InsuranceReportResult {
  groups: InsuranceReportGroup[];
  totalItems: number;
  totalValue: number;
}

export interface InsuranceReportOptions {
  locationId?: string;
  includeChildren?: boolean;
  sortBy?: 'value' | 'name' | 'type';
}

function getLocationSubtreeIds(rootId: string): Set<string> {
  const db = getDrizzle();
  const allLocations = db.select().from(locations).all();

  const childrenMap = new Map<string, string[]>();
  for (const loc of allLocations) {
    if (!loc.parentId) continue;
    const siblings = childrenMap.get(loc.parentId) ?? [];
    if (!childrenMap.has(loc.parentId)) childrenMap.set(loc.parentId, siblings);
    siblings.push(loc.id);
  }

  const ids = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.pop();
    if (!id) break;
    ids.add(id);
    const children = childrenMap.get(id);
    if (children) queue.push(...children);
  }

  return ids;
}

interface Lookups {
  locationNameMap: Map<string, string>;
  firstPhotoMap: Map<string, string>;
  receiptMap: Map<string, number[]>;
}

function buildLookups(): Lookups {
  const db = getDrizzle();
  const locationNameMap = new Map<string, string>();
  for (const loc of db.select().from(locations).all()) locationNameMap.set(loc.id, loc.name);

  const firstPhotoMap = new Map<string, string>();
  for (const photo of db.select().from(itemPhotos).orderBy(asc(itemPhotos.sortOrder)).all()) {
    if (!firstPhotoMap.has(photo.itemId)) firstPhotoMap.set(photo.itemId, photo.filePath);
  }

  const receiptMap = new Map<string, number[]>();
  const docs = db
    .select()
    .from(itemDocuments)
    .where(eq(itemDocuments.documentType, 'receipt'))
    .all();
  for (const doc of docs) {
    const existing = receiptMap.get(doc.itemId) ?? [];
    if (!receiptMap.has(doc.itemId)) receiptMap.set(doc.itemId, existing);
    existing.push(doc.paperlessDocumentId);
  }
  return { locationNameMap, firstPhotoMap, receiptMap };
}

type InventoryRow = typeof homeInventory.$inferSelect;

function compareItems(a: InventoryRow, b: InventoryRow, sortBy: 'value' | 'name' | 'type'): number {
  switch (sortBy) {
    case 'value':
      return (b.replacementValue ?? 0) - (a.replacementValue ?? 0);
    case 'name':
      return a.itemName.localeCompare(b.itemName);
    case 'type':
      return (a.type ?? '').localeCompare(b.type ?? '');
  }
}

function toReportItem(item: InventoryRow, lookups: Lookups): InsuranceReportItem {
  return {
    id: item.id,
    itemName: item.itemName,
    assetId: item.assetId,
    brand: item.brand,
    type: item.type,
    condition: item.condition,
    warrantyExpires: item.warrantyExpires,
    replacementValue: item.replacementValue,
    photoPath: lookups.firstPhotoMap.get(item.id) ?? null,
    locationId: item.locationId,
    locationName: item.locationId
      ? (lookups.locationNameMap.get(item.locationId) ?? 'Unknown')
      : null,
    receiptDocumentIds: lookups.receiptMap.get(item.id) ?? [],
  };
}

function buildGroups(items: InsuranceReportItem[], lookups: Lookups): InsuranceReportGroup[] {
  const groupMap = new Map<string | null, InsuranceReportItem[]>();
  for (const item of items) {
    const existing = groupMap.get(item.locationId) ?? [];
    if (!groupMap.has(item.locationId)) groupMap.set(item.locationId, existing);
    existing.push(item);
  }

  const groups: InsuranceReportGroup[] = [];
  for (const [locId, list] of groupMap) {
    groups.push({
      locationId: locId,
      locationName: locId ? (lookups.locationNameMap.get(locId) ?? 'Unknown') : 'No Location',
      items: list,
    });
  }
  groups.sort((a, b) => {
    if (a.locationId === null) return 1;
    if (b.locationId === null) return -1;
    return a.locationName.localeCompare(b.locationName);
  });
  return groups;
}

export function getInsuranceReport(options: InsuranceReportOptions = {}): InsuranceReportResult {
  const { locationId, includeChildren = true, sortBy = 'value' } = options;
  const db = getDrizzle();

  let locationIds: Set<string> | null = null;
  if (locationId) {
    locationIds = includeChildren ? getLocationSubtreeIds(locationId) : new Set([locationId]);
  }

  const allItems = db.select().from(homeInventory).all();
  const lookups = buildLookups();

  const filteredItems = allItems
    .filter(
      (item) => !locationIds || (item.locationId !== null && locationIds.has(item.locationId))
    )
    .toSorted((a, b) => compareItems(a, b, sortBy));

  const items = filteredItems.map((item) => toReportItem(item, lookups));
  const totalValue = filteredItems.reduce((sum, item) => sum + (item.replacementValue ?? 0), 0);

  return {
    groups: buildGroups(items, lookups),
    totalItems: items.length,
    totalValue,
  };
}
