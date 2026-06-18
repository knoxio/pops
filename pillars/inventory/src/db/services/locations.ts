/**
 * Locations CRUD service.
 *
 * Each function takes an `InventoryDb` handle as its first argument; the
 * calling layer (pops-api modules, eventually `inventory-api`) resolves
 * the singleton or transaction handle to pass in. Follows the standard
 * db-arg service pattern.
 *
 * Read helpers live in `locations-queries.ts` so the mutating CRUD layer
 * stays small and the read surface can be shared with downstream slices.
 */
import { randomUUID } from 'node:crypto';

import { asc, eq } from 'drizzle-orm';

import {
  LocationCycleError,
  LocationNotFoundError,
  LocationSelfParentError,
  ParentLocationNotFoundError,
} from '../errors.js';
import { locations } from '../schema.js';
import {
  getDeleteStats,
  getDescendantLocationIds,
  getLocationItems,
  getLocationOrThrow,
  getLocationPath,
  getLocationsList,
  type DeleteLocationStats,
  type GetLocationItemsParams,
  type LocationItemsResult,
} from './locations-queries.js';

import type { LocationRow } from '../row-types.js';
import type { InventoryDb } from './internal.js';

export type { LocationRow };

export {
  getDeleteStats,
  getDescendantLocationIds,
  getLocationItems,
  getLocationPath,
  getLocationsList,
  type DeleteLocationStats,
  type GetLocationItemsParams,
  type LocationItemsResult,
};

/** Public API shape for a location. */
export interface Location {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

/** Map a database row to the public API shape. */
export function toLocation(row: LocationRow): Location {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
  };
}

/** A location with its children, for tree responses. */
export interface LocationTreeNode extends Location {
  children: LocationTreeNode[];
}

export interface CreateLocationInput {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface UpdateLocationInput {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface LocationListResult {
  rows: LocationRow[];
  total: number;
}

export function listLocations(db: InventoryDb): LocationListResult {
  const rows = getLocationsList(db);
  return { rows, total: rows.length };
}

export function getLocation(db: InventoryDb, id: string): LocationRow {
  return getLocationOrThrow(db, id);
}

export function getLocationTree(db: InventoryDb): LocationTreeNode[] {
  const allRows = getLocationsList(db);
  const nodeMap = new Map<string, LocationTreeNode>();
  const roots: LocationTreeNode[] = [];

  for (const row of allRows) {
    nodeMap.set(row.id, { ...toLocation(row), children: [] });
  }

  for (const row of allRows) {
    const node = nodeMap.get(row.id);
    if (!node) continue;
    const parent = row.parentId ? nodeMap.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

export function getChildren(db: InventoryDb, parentId: string): LocationRow[] {
  return db
    .select()
    .from(locations)
    .where(eq(locations.parentId, parentId))
    .orderBy(asc(locations.sortOrder), asc(locations.name))
    .all();
}

function assertParentExists(db: InventoryDb, parentId: string): void {
  const parent = db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, parentId))
    .get();
  if (!parent) throw new ParentLocationNotFoundError(parentId);
}

export function createLocation(db: InventoryDb, input: CreateLocationInput): LocationRow {
  if (input.parentId !== undefined && input.parentId !== null) {
    assertParentExists(db, input.parentId);
  }

  const id = randomUUID();
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

  return getLocation(db, id);
}

function assertNoCycle(db: InventoryDb, id: string, newParentId: string): void {
  let current: string | null = newParentId;
  while (current) {
    const ancestor: { parentId: string | null } | undefined = db
      .select({ parentId: locations.parentId })
      .from(locations)
      .where(eq(locations.id, current))
      .get();
    if (!ancestor) break;
    if (ancestor.parentId === id) {
      throw new LocationCycleError(id, newParentId);
    }
    current = ancestor.parentId;
  }
}

function buildLocationUpdates(input: UpdateLocationInput): Partial<LocationRow> {
  const updates: Partial<LocationRow> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.parentId !== undefined) updates.parentId = input.parentId;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  return updates;
}

export function updateLocation(
  db: InventoryDb,
  id: string,
  input: UpdateLocationInput
): LocationRow {
  getLocation(db, id);

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) throw new LocationSelfParentError(id);
    assertParentExists(db, input.parentId);
    assertNoCycle(db, id, input.parentId);
  }

  const updates = buildLocationUpdates(input);
  if (Object.keys(updates).length > 0) {
    updates.lastEditedTime = new Date().toISOString();
    db.update(locations).set(updates).where(eq(locations.id, id)).run();
  }

  return getLocation(db, id);
}

export function deleteLocation(db: InventoryDb, id: string): void {
  getLocation(db, id);
  const result = db.delete(locations).where(eq(locations.id, id)).run();
  if (result.changes === 0) throw new LocationNotFoundError(id);
}
