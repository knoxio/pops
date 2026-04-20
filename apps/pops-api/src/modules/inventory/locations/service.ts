import { asc, eq } from 'drizzle-orm';

import { locations } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import {
  getDescendantLocationIds,
  getDeleteStats,
  getLocationItems,
  getLocationOrThrow,
  getLocationPath,
  getLocationsList,
  type LocationItemsResult,
} from './queries.js';
import { toLocation } from './types.js';

import type {
  CreateLocationInput,
  LocationRow,
  LocationTreeNode,
  UpdateLocationInput,
} from './types.js';

export {
  getDeleteStats,
  getDescendantLocationIds,
  getLocationItems,
  getLocationPath,
  type LocationItemsResult,
};

export interface LocationListResult {
  rows: LocationRow[];
  total: number;
}

export function listLocations(): LocationListResult {
  const rows = getLocationsList();
  return { rows, total: rows.length };
}

export function getLocation(id: string): LocationRow {
  return getLocationOrThrow(id);
}

export function getLocationTree(): LocationTreeNode[] {
  const allRows = getLocationsList();
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

export function getChildren(parentId: string): LocationRow[] {
  return getDrizzle()
    .select()
    .from(locations)
    .where(eq(locations.parentId, parentId))
    .orderBy(asc(locations.sortOrder), asc(locations.name))
    .all();
}

function assertParentExists(parentId: string): void {
  const parent = getDrizzle()
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, parentId))
    .get();
  if (!parent) throw new NotFoundError('Parent location', parentId);
}

export function createLocation(input: CreateLocationInput): LocationRow {
  if (input.parentId) assertParentExists(input.parentId);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  getDrizzle()
    .insert(locations)
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

function assertNoCycle(id: string, newParentId: string): void {
  const db = getDrizzle();
  let current: string | null = newParentId;
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

function buildLocationUpdates(input: UpdateLocationInput): Partial<LocationRow> {
  const updates: Partial<LocationRow> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.parentId !== undefined) updates.parentId = input.parentId;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  return updates;
}

export function updateLocation(id: string, input: UpdateLocationInput): LocationRow {
  getLocation(id);

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) throw new ConflictError('A location cannot be its own parent');
    assertParentExists(input.parentId);
    assertNoCycle(id, input.parentId);
  }

  const updates = buildLocationUpdates(input);
  if (Object.keys(updates).length > 0) {
    updates.lastEditedTime = new Date().toISOString();
    getDrizzle().update(locations).set(updates).where(eq(locations.id, id)).run();
  }

  return getLocation(id);
}

export function deleteLocation(id: string): void {
  getLocation(id);
  const result = getDrizzle().delete(locations).where(eq(locations.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Location', id);
}
