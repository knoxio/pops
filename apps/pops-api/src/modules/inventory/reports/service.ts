/**
 * Inventory reports service — warranty tracking and insurance report queries.
 */
import { isNotNull, asc, sql, desc, and, gte, lte } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { homeInventory, locations, itemPhotos } from "@pops/db-types";
import type { InventoryRow } from "../items/types.js";
import type { ValueBreakdownEntry, DashboardSummary, RecentItem } from "./types.js";

/** Warranty "expiring soon" window in days. */
const WARRANTY_WINDOW_DAYS = 90;

/**
 * Get dashboard summary: item count, total values, expiring warranties,
 * and recently added items.
 */
export function getDashboard(): DashboardSummary {
  const db = getDrizzle();

  const [summary] = db
    .select({
      itemCount: sql<number>`COUNT(*)`,
      totalReplacementValue: sql<number>`COALESCE(SUM(${homeInventory.replacementValue}), 0)`,
      totalResaleValue: sql<number>`COALESCE(SUM(${homeInventory.resaleValue}), 0)`,
    })
    .from(homeInventory)
    .all();

  const now = new Date();
  const cutoff = new Date(now.getTime() + WARRANTY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString().split("T")[0];
  const cutoffIso = cutoff.toISOString().split("T")[0];

  const [warrantyResult] = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(homeInventory)
    .where(
      and(
        isNotNull(homeInventory.warrantyExpires),
        gte(homeInventory.warrantyExpires, nowIso),
        lte(homeInventory.warrantyExpires, cutoffIso)
      )
    )
    .all();

  const recentRows = db
    .select({
      id: homeInventory.id,
      itemName: homeInventory.itemName,
      type: homeInventory.type,
      assetId: homeInventory.assetId,
      lastEditedTime: homeInventory.lastEditedTime,
    })
    .from(homeInventory)
    .orderBy(desc(homeInventory.lastEditedTime))
    .limit(5)
    .all();

  return {
    itemCount: summary?.itemCount ?? 0,
    totalReplacementValue: Math.round((summary?.totalReplacementValue ?? 0) * 100) / 100,
    totalResaleValue: Math.round((summary?.totalResaleValue ?? 0) * 100) / 100,
    warrantiesExpiringSoon: warrantyResult?.cnt ?? 0,
    recentlyAdded: recentRows as RecentItem[],
  };
}

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

// ---------------------------------------------------------------------------
// Value breakdown
// ---------------------------------------------------------------------------

/**
 * Get replacement value breakdown grouped by location.
 */
export function getValueByLocation(): ValueBreakdownEntry[] {
  const db = getDrizzle();

  return db
    .select({
      name: sql<string>`COALESCE(${locations.name}, 'Unassigned')`,
      totalValue: sql<number>`COALESCE(SUM(${homeInventory.replacementValue}), 0)`,
      itemCount: sql<number>`COUNT(*)`,
    })
    .from(homeInventory)
    .leftJoin(locations, sql`${homeInventory.locationId} = ${locations.id}`)
    .groupBy(sql`COALESCE(${locations.name}, 'Unassigned')`)
    .orderBy(desc(sql`COALESCE(SUM(${homeInventory.replacementValue}), 0)`))
    .all() as ValueBreakdownEntry[];
}

/**
 * Get replacement value breakdown grouped by item type.
 */
export function getValueByType(): ValueBreakdownEntry[] {
  const db = getDrizzle();

  return db
    .select({
      name: sql<string>`COALESCE(${homeInventory.type}, 'Uncategorized')`,
      totalValue: sql<number>`COALESCE(SUM(${homeInventory.replacementValue}), 0)`,
      itemCount: sql<number>`COUNT(*)`,
    })
    .from(homeInventory)
    .groupBy(sql`COALESCE(${homeInventory.type}, 'Uncategorized')`)
    .orderBy(desc(sql`COALESCE(SUM(${homeInventory.replacementValue}), 0)`))
    .all() as ValueBreakdownEntry[];
}
