/**
 * Inventory reports service — warranty tracking and insurance report queries.
 */
import { isNotNull, asc } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { homeInventory, locations, itemPhotos } from "@pops/db-types";
import type { InventoryRow } from "../items/types.js";

/** List all inventory items that have a warranty expiry date, sorted by expiry. */
export function listWarrantyItems(): InventoryRow[] {
  const db = getDrizzle();
  return db
    .select()
    .from(homeInventory)
    .where(isNotNull(homeInventory.warrantyExpires))
    .orderBy(homeInventory.warrantyExpires)
    .all();
}

// ---------------------------------------------------------------------------
// Insurance report
// ---------------------------------------------------------------------------

export interface InsuranceReportItem {
  id: string;
  itemName: string;
  assetId: string | null;
  brand: string | null;
  condition: string | null;
  warrantyExpires: string | null;
  replacementValue: number | null;
  photoPath: string | null;
  locationId: string | null;
  locationName: string | null;
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

/**
 * Get insurance report data, optionally filtered to a location subtree.
 * Items are grouped by location. Each item includes its first photo path.
 */
export function getInsuranceReport(locationId?: string): InsuranceReportResult {
  const db = getDrizzle();

  // Get all location IDs in the subtree if filtering
  let locationIds: Set<string> | null = null;
  if (locationId) {
    locationIds = getLocationSubtreeIds(locationId);
  }

  // Get all items with their location names
  const allItems = db.select().from(homeInventory).orderBy(asc(homeInventory.itemName)).all();

  // Build location name map
  const locationRows = db.select().from(locations).all();
  const locationNameMap = new Map<string, string>();
  for (const loc of locationRows) {
    locationNameMap.set(loc.id, loc.name);
  }

  // Get first photo per item (lowest sortOrder)
  const photos = db.select().from(itemPhotos).orderBy(asc(itemPhotos.sortOrder)).all();
  const firstPhotoMap = new Map<string, string>();
  for (const photo of photos) {
    if (!firstPhotoMap.has(photo.itemId)) {
      firstPhotoMap.set(photo.itemId, photo.filePath);
    }
  }

  // Filter items
  const filteredItems = allItems.filter((item) => {
    if (!locationIds) return true;
    return item.locationId !== null && locationIds.has(item.locationId);
  });

  // Group by location
  const groupMap = new Map<string | null, InsuranceReportItem[]>();
  let totalValue = 0;

  for (const item of filteredItems) {
    const key = item.locationId;
    const existing = groupMap.get(key) ?? [];
    if (!groupMap.has(key)) {
      groupMap.set(key, existing);
    }
    existing.push({
      id: item.id,
      itemName: item.itemName,
      assetId: item.assetId,
      brand: item.brand,
      condition: item.condition,
      warrantyExpires: item.warrantyExpires,
      replacementValue: item.replacementValue,
      photoPath: firstPhotoMap.get(item.id) ?? null,
      locationId: item.locationId,
      locationName: item.locationId ? (locationNameMap.get(item.locationId) ?? "Unknown") : null,
    });
    if (item.replacementValue) {
      totalValue += item.replacementValue;
    }
  }

  // Convert to sorted groups (locations with items first, then unlocated)
  const groups: InsuranceReportGroup[] = [];
  for (const [locId, items] of groupMap) {
    groups.push({
      locationId: locId,
      locationName: locId ? (locationNameMap.get(locId) ?? "Unknown") : "No Location",
      items,
    });
  }
  groups.sort((a, b) => {
    if (a.locationId === null) return 1;
    if (b.locationId === null) return -1;
    return a.locationName.localeCompare(b.locationName);
  });

  return {
    groups,
    totalItems: filteredItems.length,
    totalValue,
  };
}

/** Get all location IDs in a subtree (including the root). */
function getLocationSubtreeIds(rootId: string): Set<string> {
  const db = getDrizzle();
  const allLocations = db.select().from(locations).all();

  const childrenMap = new Map<string, string[]>();
  for (const loc of allLocations) {
    if (loc.parentId) {
      const siblings = childrenMap.get(loc.parentId) ?? [];
      if (!childrenMap.has(loc.parentId)) {
        childrenMap.set(loc.parentId, siblings);
      }
      siblings.push(loc.id);
    }
  }

  const ids = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.pop();
    if (!id) break;
    ids.add(id);
    const children = childrenMap.get(id);
    if (children) {
      queue.push(...children);
    }
  }

  return ids;
}
