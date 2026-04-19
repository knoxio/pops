import crypto from 'crypto';

import { and, count, eq, inArray, isNotNull, like, sql, sum, type SQL } from 'drizzle-orm';

/**
 * Inventory service — CRUD operations using Drizzle ORM.
 * SQLite is the source of truth. All operations are local.
 */
import { homeInventory } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';
import { getDescendantLocationIds } from '../locations/service.js';
import { buildInventoryUpdate } from './update-builder.js';

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

function buildInventoryConditions(opts: ListInventoryItemsOptions): SQL[] {
  const conditions: SQL[] = [];
  if (opts.search) conditions.push(like(homeInventory.itemName, `%${opts.search}%`));
  if (opts.room) conditions.push(eq(homeInventory.room, opts.room));
  if (opts.type) conditions.push(eq(homeInventory.type, opts.type));
  if (opts.condition) {
    conditions.push(sql`lower(${homeInventory.condition}) = lower(${opts.condition})`);
  }
  if (opts.inUse !== undefined) conditions.push(eq(homeInventory.inUse, opts.inUse ? 1 : 0));
  if (opts.deductible !== undefined) {
    conditions.push(eq(homeInventory.deductible, opts.deductible ? 1 : 0));
  }
  if (opts.locationId)
    conditions.push(buildLocationCondition(opts.locationId, opts.includeChildren));
  if (opts.assetId) conditions.push(eq(homeInventory.assetId, opts.assetId));
  return conditions;
}

function buildLocationCondition(locationId: string, includeChildren: boolean | undefined): SQL {
  if (includeChildren) {
    const ids = [locationId, ...getDescendantLocationIds(locationId)];
    return inArray(homeInventory.locationId, ids);
  }
  return eq(homeInventory.locationId, locationId);
}

function combineConditions(conditions: SQL[]): SQL | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

/** List inventory items with optional filters. */
export function listInventoryItems(opts: ListInventoryItemsOptions): InventoryListResult {
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

  const where = combineConditions(buildInventoryConditions(opts));
  if (where) {
    query = query.where(where);
    countQuery = countQuery.where(where);
    sumQuery = sumQuery.where(where);
  }

  const rows = query.orderBy(homeInventory.itemName).limit(opts.limit).offset(opts.offset).all();
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

function buildCreateValues(
  id: string,
  now: string,
  input: CreateInventoryItemInput
): typeof homeInventory.$inferInsert {
  return {
    id,
    itemName: input.itemName,
    inUse: input.inUse ? 1 : 0,
    deductible: input.deductible ? 1 : 0,
    lastEditedTime: now,
    ...nullableStringsFromInput(input),
    ...nullableNumbersFromInput(input),
  };
}

const CREATE_NULLABLE_STRING_KEYS = [
  'brand',
  'model',
  'itemId',
  'room',
  'location',
  'type',
  'condition',
  'purchaseDate',
  'warrantyExpires',
  'purchaseTransactionId',
  'purchasedFromId',
  'purchasedFromName',
  'assetId',
  'notes',
  'locationId',
] as const satisfies ReadonlyArray<
  keyof CreateInventoryItemInput & keyof typeof homeInventory.$inferInsert
>;

const CREATE_NULLABLE_NUMBER_KEYS = [
  'replacementValue',
  'resaleValue',
] as const satisfies ReadonlyArray<
  keyof CreateInventoryItemInput & keyof typeof homeInventory.$inferInsert
>;

function nullableStringsFromInput(
  input: CreateInventoryItemInput
): Partial<typeof homeInventory.$inferInsert> {
  const out: Record<string, unknown> = {};
  for (const key of CREATE_NULLABLE_STRING_KEYS) {
    out[key] = input[key] ?? null;
  }
  return out as Partial<typeof homeInventory.$inferInsert>;
}

function nullableNumbersFromInput(
  input: CreateInventoryItemInput
): Partial<typeof homeInventory.$inferInsert> {
  const out: Record<string, unknown> = {};
  for (const key of CREATE_NULLABLE_NUMBER_KEYS) {
    out[key] = input[key] ?? null;
  }
  return out as Partial<typeof homeInventory.$inferInsert>;
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
    .values(buildCreateValues(id, now, input))
    .run();

  return getInventoryItem(id);
}

/**
 * Update an existing inventory item. Returns the updated row.
 * Updates directly in SQLite.
 */
export function updateInventoryItem(id: string, input: UpdateInventoryItemInput): InventoryRow {
  getInventoryItem(id);

  const updates = buildInventoryUpdate(input);
  if (updates) {
    const db = getDrizzle();
    db.update(homeInventory).set(updates).where(eq(homeInventory.id, id)).run();
  }

  return getInventoryItem(id);
}

/**
 * Delete an inventory item by ID. Throws NotFoundError if missing.
 * Deletes directly from SQLite.
 */
export function deleteInventoryItem(id: string): void {
  getInventoryItem(id);

  const db = getDrizzle();
  const result = db.delete(homeInventory).where(eq(homeInventory.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Inventory item', id);
}
