import crypto from 'crypto';

import { and, count, eq, inArray, isNotNull, like, sql, sum } from 'drizzle-orm';

/**
 * Inventory service — CRUD operations using Drizzle ORM.
 * SQLite is the source of truth. All operations are local.
 */
import { homeInventory } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';
import { getDescendantLocationIds } from '../locations/service.js';

import type { CreateInventoryItemInput, InventoryRow, UpdateInventoryItemInput } from './types.js';

/** Count + rows + value aggregates for a paginated list. */
export interface InventoryListResult {
  rows: InventoryRow[];
  total: number;
  totalReplacementValue: number;
  totalResaleValue: number;
}

/** Options for listing inventory items. */
export interface ListInventoryItemsOptions {
  search?: string;
  room?: string;
  type?: string;
  condition?: string;
  inUse?: boolean;
  deductible?: boolean;
  limit: number;
  offset: number;
  locationId?: string;
  assetId?: string;
  includeChildren?: boolean;
}

/** List inventory items with optional filters. */
export function listInventoryItems(opts: ListInventoryItemsOptions): InventoryListResult {
  const {
    search,
    room,
    type,
    condition,
    inUse,
    deductible,
    limit,
    offset,
    locationId,
    assetId,
    includeChildren,
  } = opts;
  const db = getDrizzle();

  let query = db.select().from(homeInventory).$dynamic();
  let countQuery = db.select({ total: count() }).from(homeInventory).$dynamic();
  let sumQuery = db
    .select({
      replacementSum: sum(homeInventory.replacementValue),
      resaleSum: sum(homeInventory.resaleValue),
    })
    .from(homeInventory)
    .$dynamic();

  const conditions = [];
  if (search) {
    conditions.push(like(homeInventory.itemName, `%${search}%`));
  }
  if (room) {
    conditions.push(eq(homeInventory.room, room));
  }
  if (type) {
    conditions.push(eq(homeInventory.type, type));
  }
  if (condition) {
    conditions.push(sql`lower(${homeInventory.condition}) = lower(${condition})`);
  }
  if (inUse !== undefined) {
    conditions.push(eq(homeInventory.inUse, inUse ? 1 : 0));
  }
  if (deductible !== undefined) {
    conditions.push(eq(homeInventory.deductible, deductible ? 1 : 0));
  }
  if (locationId) {
    if (includeChildren) {
      const locationIds = [locationId, ...getDescendantLocationIds(locationId)];
      conditions.push(inArray(homeInventory.locationId, locationIds));
    } else {
      conditions.push(eq(homeInventory.locationId, locationId));
    }
  }
  if (assetId) {
    conditions.push(eq(homeInventory.assetId, assetId));
  }

  if (conditions.length > 0) {
    const where = conditions.length === 1 ? conditions[0] : and(...conditions);
    query = query.where(where);
    countQuery = countQuery.where(where);
    sumQuery = sumQuery.where(where);
  }

  const rows = query.orderBy(homeInventory.itemName).limit(limit).offset(offset).all();

  const [countResult] = countQuery.all();
  const [sumResult] = sumQuery.all();

  return {
    rows,
    total: countResult?.total ?? 0,
    totalReplacementValue: Number(sumResult?.replacementSum) || 0,
    totalResaleValue: Number(sumResult?.resaleSum) || 0,
  };
}

/**
 * Search for an inventory item by exact asset ID (case-insensitive).
 * Returns the item or null if not found.
 */
export function searchByAssetId(assetId: string): InventoryRow | null {
  const db = getDrizzle();
  const [row] = db
    .select()
    .from(homeInventory)
    .where(sql`LOWER(${homeInventory.assetId}) = LOWER(${assetId})`)
    .all();
  return row ?? null;
}

/**
 * Count inventory items whose assetId starts with the given prefix (case-insensitive).
 */
export function countByAssetPrefix(prefix: string): number {
  const db = getDrizzle();
  const [result] = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(homeInventory)
    .where(sql`LOWER(${homeInventory.assetId}) LIKE LOWER(${prefix + '%'})`)
    .all();
  return result?.count ?? 0;
}

/** Return distinct item types that exist in the database. */
export function getDistinctTypes(): string[] {
  const db = getDrizzle();
  const rows = db
    .selectDistinct({ type: homeInventory.type })
    .from(homeInventory)
    .where(isNotNull(homeInventory.type))
    .orderBy(homeInventory.type)
    .all();
  return rows.map((r) => r.type).filter((t): t is string => t !== null);
}

/** Get a single inventory item by id. Throws NotFoundError if missing. */
export function getInventoryItem(id: string): InventoryRow {
  const db = getDrizzle();
  const [row] = db.select().from(homeInventory).where(eq(homeInventory.id, id)).all();

  if (!row) throw new NotFoundError('Inventory item', id);
  return row;
}

/**
 * Create a new inventory item. Returns the created row.
 * Generates a local UUID and inserts directly into SQLite.
 */
export function createInventoryItem(input: CreateInventoryItemInput): InventoryRow {
  const db = getDrizzle();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(homeInventory)
    .values({
      id,
      itemName: input.itemName,
      brand: input.brand ?? null,
      model: input.model ?? null,
      itemId: input.itemId ?? null,
      room: input.room ?? null,
      location: input.location ?? null,
      type: input.type ?? null,
      condition: input.condition ?? null,
      inUse: input.inUse ? 1 : 0,
      deductible: input.deductible ? 1 : 0,
      purchaseDate: input.purchaseDate ?? null,
      warrantyExpires: input.warrantyExpires ?? null,
      replacementValue: input.replacementValue ?? null,
      resaleValue: input.resaleValue ?? null,
      purchaseTransactionId: input.purchaseTransactionId ?? null,
      purchasedFromId: input.purchasedFromId ?? null,
      purchasedFromName: input.purchasedFromName ?? null,
      assetId: input.assetId ?? null,
      notes: input.notes ?? null,
      locationId: input.locationId ?? null,
      lastEditedTime: now,
    })
    .run();

  return getInventoryItem(id);
}

/**
 * Update an existing inventory item. Returns the updated row.
 * Updates directly in SQLite.
 */
export function updateInventoryItem(id: string, input: UpdateInventoryItemInput): InventoryRow {
  const db = getDrizzle();

  // Verify it exists first
  getInventoryItem(id);

  const updates: Partial<typeof homeInventory.$inferInsert> = {};
  let hasUpdates = false;

  if (input.itemName !== undefined) {
    updates.itemName = input.itemName;
    hasUpdates = true;
  }
  if (input.brand !== undefined) {
    updates.brand = input.brand ?? null;
    hasUpdates = true;
  }
  if (input.model !== undefined) {
    updates.model = input.model ?? null;
    hasUpdates = true;
  }
  if (input.itemId !== undefined) {
    updates.itemId = input.itemId ?? null;
    hasUpdates = true;
  }
  if (input.room !== undefined) {
    updates.room = input.room ?? null;
    hasUpdates = true;
  }
  if (input.location !== undefined) {
    updates.location = input.location ?? null;
    hasUpdates = true;
  }
  if (input.type !== undefined) {
    updates.type = input.type ?? null;
    hasUpdates = true;
  }
  if (input.condition !== undefined) {
    updates.condition = input.condition ?? null;
    hasUpdates = true;
  }
  if (input.inUse !== undefined) {
    updates.inUse = input.inUse ? 1 : 0;
    hasUpdates = true;
  }
  if (input.deductible !== undefined) {
    updates.deductible = input.deductible ? 1 : 0;
    hasUpdates = true;
  }
  if (input.purchaseDate !== undefined) {
    updates.purchaseDate = input.purchaseDate ?? null;
    hasUpdates = true;
  }
  if (input.warrantyExpires !== undefined) {
    updates.warrantyExpires = input.warrantyExpires ?? null;
    hasUpdates = true;
  }
  if (input.replacementValue !== undefined) {
    updates.replacementValue = input.replacementValue ?? null;
    hasUpdates = true;
  }
  if (input.resaleValue !== undefined) {
    updates.resaleValue = input.resaleValue ?? null;
    hasUpdates = true;
  }
  if (input.purchaseTransactionId !== undefined) {
    updates.purchaseTransactionId = input.purchaseTransactionId ?? null;
    hasUpdates = true;
  }
  if (input.purchasedFromId !== undefined) {
    updates.purchasedFromId = input.purchasedFromId ?? null;
    hasUpdates = true;
  }
  if (input.purchasedFromName !== undefined) {
    updates.purchasedFromName = input.purchasedFromName ?? null;
    hasUpdates = true;
  }
  if (input.assetId !== undefined) {
    updates.assetId = input.assetId ?? null;
    hasUpdates = true;
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes ?? null;
    hasUpdates = true;
  }
  if (input.locationId !== undefined) {
    updates.locationId = input.locationId ?? null;
    hasUpdates = true;
  }

  if (hasUpdates) {
    updates.lastEditedTime = new Date().toISOString();
    db.update(homeInventory).set(updates).where(eq(homeInventory.id, id)).run();
  }

  return getInventoryItem(id);
}

/**
 * Delete an inventory item by ID. Throws NotFoundError if missing.
 * Deletes directly from SQLite.
 */
export function deleteInventoryItem(id: string): void {
  // Verify it exists first
  getInventoryItem(id);

  const db = getDrizzle();
  const result = db.delete(homeInventory).where(eq(homeInventory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Inventory item', id);
}
