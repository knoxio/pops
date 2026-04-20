import { asc, count, eq, inArray } from 'drizzle-orm';

import { homeInventory, locations } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';

import type { DeleteLocationStats, LocationRow } from './types.js';

/**
 * Collect all descendant location IDs via BFS.
 *
 * Implementation note: fetches every (id, parentId) pair once and traverses the
 * in-memory adjacency map, avoiding both N+1 DB queries and Array#shift's O(n)
 * cost per pop.
 */
export function getDescendantLocationIds(id: string): string[] {
  const db = getDrizzle();
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

function fetchOne(id: string): LocationRow | undefined {
  return getDrizzle().select().from(locations).where(eq(locations.id, id)).get();
}

export function getLocationOrThrow(id: string): LocationRow {
  const row = fetchOne(id);
  if (!row) throw new NotFoundError('Location', id);
  return row;
}

/** Get the breadcrumb path from root to the specified location (root-first). */
export function getLocationPath(id: string): LocationRow[] {
  const path: LocationRow[] = [];
  let current: LocationRow | undefined = getLocationOrThrow(id);
  while (current) {
    path.push(current);
    current = current.parentId ? fetchOne(current.parentId) : undefined;
  }
  return path.toReversed();
}

export interface LocationItemsResult {
  rows: (typeof homeInventory.$inferSelect)[];
  total: number;
}

export function getLocationItems(
  locationId: string,
  includeChildren: boolean,
  limit: number,
  offset: number
): LocationItemsResult {
  getLocationOrThrow(locationId);
  const db = getDrizzle();
  const locationIds = [locationId];
  if (includeChildren) locationIds.push(...getDescendantLocationIds(locationId));

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

export function getDeleteStats(id: string): DeleteLocationStats {
  getLocationOrThrow(id);
  const db = getDrizzle();

  const directChildren = db.select().from(locations).where(eq(locations.parentId, id)).all();
  const descendantIds = getDescendantLocationIds(id);

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

export function getLocationsList(): LocationRow[] {
  return getDrizzle()
    .select()
    .from(locations)
    .orderBy(asc(locations.sortOrder), asc(locations.name))
    .all();
}
