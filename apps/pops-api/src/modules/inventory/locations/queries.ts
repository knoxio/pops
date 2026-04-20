import { asc, count, eq, inArray } from 'drizzle-orm';

import { homeInventory, locations } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';

import type { DeleteLocationStats, LocationRow } from './types.js';

/** Collect all descendant location IDs via BFS. */
export function getDescendantLocationIds(id: string): string[] {
  const db = getDrizzle();
  const descendantIds: string[] = [];
  const queue = [id];
  let current: string | undefined;
  while ((current = queue.shift()) !== undefined) {
    const children = db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.parentId, current))
      .all();
    for (const child of children) {
      descendantIds.push(child.id);
      queue.push(child.id);
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
  for (const descId of descendantIds) {
    const [desc] = db
      .select({ total: count() })
      .from(homeInventory)
      .where(eq(homeInventory.locationId, descId))
      .all();
    totalItemCount += desc?.total ?? 0;
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
