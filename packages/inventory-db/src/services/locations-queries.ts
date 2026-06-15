/**
 * Read-only queries for the locations slice.
 *
 * Functions in this file are pure reads — they take a drizzle handle and
 * return rows (or throw a typed `LocationNotFoundError` if the lookup
 * misses). They are intentionally separate from `locations.ts` so the
 * mutating CRUD layer stays small and the queries can be shared with
 * downstream slices (delete-stats walks the location tree and counts
 * items, which the items slice will eventually need too).
 */
import { asc, count, eq, inArray } from 'drizzle-orm';

import { LocationNotFoundError } from '../errors.js';
import { homeInventory, locations } from '../schema.js';

import type { LocationRow } from '../row-types.js';
import type { InventoryDb } from './internal.js';

/** Stats returned before confirming a delete. */
export interface DeleteLocationStats {
  /** Number of direct child locations. */
  childCount: number;
  /** Total number of descendant locations (children, grandchildren, etc.). */
  descendantCount: number;
  /** Number of inventory items directly in this location. */
  itemCount: number;
  /** Number of inventory items in this location and all descendants. */
  totalItemCount: number;
}

export interface LocationItemsResult {
  rows: (typeof homeInventory.$inferSelect)[];
  total: number;
}

export interface GetLocationItemsParams {
  locationId: string;
  includeChildren: boolean;
  limit: number;
  offset: number;
}

/**
 * Collect all descendant location IDs via BFS.
 *
 * Fetches every (id, parentId) pair once and traverses an in-memory
 * adjacency map, avoiding both N+1 DB queries and `Array#shift`'s O(n)
 * cost per pop.
 */
export function getDescendantLocationIds(db: InventoryDb, id: string): string[] {
  const allRows = db
    .select({ id: locations.id, parentId: locations.parentId })
    .from(locations)
    .all();
  const childrenByParent = new Map<string, string[]>();
  for (const row of allRows) {
    if (row.parentId === null) continue;
    const list = childrenByParent.get(row.parentId);
    if (list) list.push(row.id);
    else childrenByParent.set(row.parentId, [row.id]);
  }
  const descendantIds: string[] = [];
  const queue: string[] = [id];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current === undefined) continue;
    const children = childrenByParent.get(current);
    if (!children) continue;
    for (const childId of children) {
      descendantIds.push(childId);
      queue.push(childId);
    }
  }
  return descendantIds;
}

function fetchOne(db: InventoryDb, id: string): LocationRow | undefined {
  return db.select().from(locations).where(eq(locations.id, id)).get();
}

export function getLocationOrThrow(db: InventoryDb, id: string): LocationRow {
  const row = fetchOne(db, id);
  if (!row) throw new LocationNotFoundError(id);
  return row;
}

/** Get the breadcrumb path from root to the specified location (root-first). */
export function getLocationPath(db: InventoryDb, id: string): LocationRow[] {
  const path: LocationRow[] = [];
  let current: LocationRow | undefined = getLocationOrThrow(db, id);
  while (current) {
    path.push(current);
    current = current.parentId ? fetchOne(db, current.parentId) : undefined;
  }
  return path.toReversed();
}

export function getLocationItems(
  db: InventoryDb,
  params: GetLocationItemsParams
): LocationItemsResult {
  const { locationId, includeChildren, limit, offset } = params;
  getLocationOrThrow(db, locationId);
  const locationIds = [locationId];
  if (includeChildren) locationIds.push(...getDescendantLocationIds(db, locationId));

  const rows = db
    .select()
    .from(homeInventory)
    .where(inArray(homeInventory.locationId, locationIds))
    .orderBy(homeInventory.itemName)
    .limit(limit)
    .offset(offset)
    .all();

  const [countResult] = db
    .select({ total: count() })
    .from(homeInventory)
    .where(inArray(homeInventory.locationId, locationIds))
    .all();

  return { rows, total: countResult?.total ?? 0 };
}

export function getDeleteStats(db: InventoryDb, id: string): DeleteLocationStats {
  getLocationOrThrow(db, id);

  const directChildren = db.select().from(locations).where(eq(locations.parentId, id)).all();
  const descendantIds = getDescendantLocationIds(db, id);

  const [directItems] = db
    .select({ total: count() })
    .from(homeInventory)
    .where(eq(homeInventory.locationId, id))
    .all();
  const itemCount = directItems?.total ?? 0;

  let totalItemCount = itemCount;
  if (descendantIds.length > 0) {
    const [descAgg] = db
      .select({ total: count() })
      .from(homeInventory)
      .where(inArray(homeInventory.locationId, descendantIds))
      .all();
    totalItemCount += descAgg?.total ?? 0;
  }

  return {
    childCount: directChildren.length,
    descendantCount: descendantIds.length,
    itemCount,
    totalItemCount,
  };
}

export function getLocationsList(db: InventoryDb): LocationRow[] {
  return db.select().from(locations).orderBy(asc(locations.sortOrder), asc(locations.name)).all();
}
