/**
 * Location service — CRUD operations for the location tree.
 * SQLite is the source of truth. All operations are local.
 */
import { homeInventory, locations } from '@pops/db-types';
import { asc, count, eq, inArray } from 'drizzle-orm';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import type {
  CreateLocationInput,
  DeleteLocationStats,
  LocationRow,
  LocationTreeNode,
  UpdateLocationInput,
} from './types.js';
import { toLocation } from './types.js';

/** Count + rows for a paginated list. */
export interface LocationListResult {
  rows: LocationRow[];
  total: number;
}

/** List all locations (flat, ordered by name). */
export function listLocations(): LocationListResult {
  const db = getDrizzle();

  const rows = db
    .select()
    .from(locations)
    .orderBy(asc(locations.sortOrder), asc(locations.name))
    .all();

  return { rows, total: rows.length };
}

/** Get a single location by ID. Throws NotFoundError if missing. */
export function getLocation(id: string): LocationRow {
  const db = getDrizzle();
  const row = db.select().from(locations).where(eq(locations.id, id)).get();

  if (!row) throw new NotFoundError('Location', id);
  return row;
}

/**
 * Get the full location tree as nested nodes.
 * Uses a single query + in-memory tree assembly.
 */
export function getLocationTree(): LocationTreeNode[] {
  const db = getDrizzle();

  const allRows = db
    .select()
    .from(locations)
    .orderBy(asc(locations.sortOrder), asc(locations.name))
    .all();

  // Build tree from flat list
  const nodeMap = new Map<string, LocationTreeNode>();
  const roots: LocationTreeNode[] = [];

  // First pass: create all nodes
  for (const row of allRows) {
    nodeMap.set(row.id, { ...toLocation(row), children: [] });
  }

  // Second pass: link children to parents
  for (const row of allRows) {
    const node = nodeMap.get(row.id);
    if (!node) continue;
    const parent = row.parentId ? nodeMap.get(row.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** Get children of a location (one level). */
export function getChildren(parentId: string): LocationRow[] {
  const db = getDrizzle();
  return db
    .select()
    .from(locations)
    .where(eq(locations.parentId, parentId))
    .orderBy(asc(locations.sortOrder), asc(locations.name))
    .all();
}

/**
 * Create a new location. Returns the created row.
 * Validates that parentId exists if provided.
 */
export function createLocation(input: CreateLocationInput): LocationRow {
  const db = getDrizzle();

  // Validate parent exists if provided
  if (input.parentId) {
    const parent = db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, input.parentId))
      .get();
    if (!parent) throw new NotFoundError('Parent location', input.parentId);
  }

  const id = crypto.randomUUID();

  const now = new Date().toISOString();

  db.insert(locations)
    .values({
      id,
      name: input.name,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
      lastEditedTime: now,
    })
    .run();

  return getLocation(id);
}

/**
 * Update an existing location. Returns the updated row.
 * Validates parentId if changing it, prevents circular references.
 */
export function updateLocation(id: string, input: UpdateLocationInput): LocationRow {
  const db = getDrizzle();

  // Verify it exists
  getLocation(id);

  // If changing parent, validate it exists and prevent cycles
  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) {
      throw new ConflictError('A location cannot be its own parent');
    }

    const parent = db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, input.parentId))
      .get();
    if (!parent) throw new NotFoundError('Parent location', input.parentId);

    // Check for circular reference: walk up from proposed parent
    let current: string | null = input.parentId;
    while (current) {
      const ancestor = db
        .select({ parentId: locations.parentId })
        .from(locations)
        .where(eq(locations.id, current))
        .get();
      if (!ancestor) break;
      if (ancestor.parentId === id) {
        throw new ConflictError('Moving this location would create a circular reference');
      }
      current = ancestor.parentId;
    }
  }

  const updates: Partial<LocationRow> = {};
  let hasUpdates = false;

  if (input.name !== undefined) {
    updates.name = input.name;
    hasUpdates = true;
  }
  if (input.parentId !== undefined) {
    updates.parentId = input.parentId;
    hasUpdates = true;
  }
  if (input.sortOrder !== undefined) {
    updates.sortOrder = input.sortOrder;
    hasUpdates = true;
  }

  if (hasUpdates) {
    updates.lastEditedTime = new Date().toISOString();
    db.update(locations).set(updates).where(eq(locations.id, id)).run();
  }

  return getLocation(id);
}

/**
 * Get stats about what will be affected by deleting a location.
 * Walks the subtree to count all descendants and their items.
 */
export function getDeleteStats(id: string): DeleteLocationStats {
  // Verify it exists
  getLocation(id);

  const db = getDrizzle();

  // Count direct children
  const directChildren = db.select().from(locations).where(eq(locations.parentId, id)).all();
  const childCount = directChildren.length;

  // Collect all descendant IDs (BFS)
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

  // Count items directly in this location
  const [directItems] = db
    .select({ total: count() })
    .from(homeInventory)
    .where(eq(homeInventory.locationId, id))
    .all();
  const itemCount = directItems?.total ?? 0;

  // Count items in all descendant locations
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
    childCount,
    descendantCount: descendantIds.length,
    itemCount,
    totalItemCount,
  };
}

/**
 * Delete a location by ID. Throws NotFoundError if missing.
 * Children are cascade-deleted by the FK constraint.
 * Items in deleted locations become unlocated (SET NULL FK).
 */
export function deleteLocation(id: string): void {
  // Verify it exists
  getLocation(id);

  const db = getDrizzle();
  const result = db.delete(locations).where(eq(locations.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Location', id);
}

/**
 * Collect all descendant location IDs via BFS.
 * Does NOT include the given id itself.
 */
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

/**
 * Get the breadcrumb path from root to the specified location (root-first).
 * Throws NotFoundError if the location doesn't exist.
 */
export function getLocationPath(id: string): LocationRow[] {
  const path: LocationRow[] = [];
  let current: LocationRow | undefined = getLocation(id);

  while (current) {
    path.push(current);
    if (current.parentId) {
      const db = getDrizzle();
      const parent = db.select().from(locations).where(eq(locations.id, current.parentId)).get();
      current = parent;
    } else {
      current = undefined;
    }
  }

  return path.reverse();
}

/** Items at a location, optionally including descendant locations. */
export interface LocationItemsResult {
  rows: (typeof homeInventory.$inferSelect)[];
  total: number;
}

/**
 * Get items at a location, optionally including items at all descendant locations.
 */
export function getLocationItems(
  locationId: string,
  includeChildren: boolean,
  limit: number,
  offset: number
): LocationItemsResult {
  // Verify location exists
  getLocation(locationId);

  const db = getDrizzle();
  const locationIds = [locationId];
  if (includeChildren) {
    locationIds.push(...getDescendantLocationIds(locationId));
  }

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
