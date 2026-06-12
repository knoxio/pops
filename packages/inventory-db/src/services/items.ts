/**
 * Inventory items CRUD service.
 *
 * Each function takes an `InventoryDb` handle as its first argument; the
 * calling layer (pops-api modules, pops-inventory-api routers) resolves
 * the singleton or transaction handle to pass in. Mirrors the locations
 * writer pattern (db-arg, scoped builders, typed errors).
 *
 * The live writer in `apps/pops-inventory-api/src/modules/items/service.ts`
 * is the source of truth for the wire surface — this scaffold mirrors its
 * signatures so the PR2 reads-cutover can swap consumers over to
 * `itemsService.*` without a behavioural change.
 */
import { randomUUID } from 'node:crypto';

import { and, count, eq, inArray, isNotNull, like, sql, sum, type SQL } from 'drizzle-orm';

import { homeInventory } from '../schema.js';
import { buildCreateValues } from './items-create-builder.js';
import { ItemNotFoundError } from './items-errors.js';
import { buildUpdateValues } from './items-update-builder.js';
import { getDescendantLocationIds } from './locations-queries.js';

import type { InventoryDb } from './internal.js';
import type {
  CreateItemInput,
  InventoryRow,
  ItemFilters,
  ItemListResult,
  UpdateItemInput,
} from './items-types.js';

export {
  type CreateItemInput,
  type InventoryRow,
  type Item,
  type ItemFilters,
  type ItemListResult,
  toItem,
  type UpdateItemInput,
} from './items-types.js';

export { ItemConflictError, ItemNotFoundError } from './items-errors.js';

function buildLocationCondition(
  db: InventoryDb,
  locationId: string,
  includeChildren: boolean | undefined
): SQL {
  if (!includeChildren) return eq(homeInventory.locationId, locationId);
  const descendants = getDescendantLocationIds(db, locationId);
  return inArray(homeInventory.locationId, [locationId, ...descendants]);
}

function buildItemConditions(db: InventoryDb, opts: ItemFilters): SQL[] {
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
  if (opts.locationId) {
    conditions.push(buildLocationCondition(db, opts.locationId, opts.includeChildren));
  }
  if (opts.assetId) conditions.push(eq(homeInventory.assetId, opts.assetId));
  return conditions;
}

function combineConditions(conditions: SQL[]): SQL | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

/** List inventory items with optional filters. */
export function list(db: InventoryDb, opts: ItemFilters): ItemListResult {
  let query = db.select().from(homeInventory).$dynamic();
  let countQuery = db.select({ total: count() }).from(homeInventory).$dynamic();
  let sumQuery = db
    .select({
      replacementSum: sum(homeInventory.replacementValue),
      resaleSum: sum(homeInventory.resaleValue),
    })
    .from(homeInventory)
    .$dynamic();

  const where = combineConditions(buildItemConditions(db, opts));
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

/** Get a single inventory item by id. Throws `ItemNotFoundError` if missing. */
export function get(db: InventoryDb, id: string): InventoryRow {
  const [row] = db.select().from(homeInventory).where(eq(homeInventory.id, id)).all();
  if (!row) throw new ItemNotFoundError(id);
  return row;
}

/**
 * Search for an inventory item by exact asset ID (case-insensitive).
 * Returns the row or `null` if not found.
 */
export function searchByAssetId(db: InventoryDb, assetId: string): InventoryRow | null {
  const [row] = db
    .select()
    .from(homeInventory)
    .where(sql`LOWER(${homeInventory.assetId}) = LOWER(${assetId})`)
    .all();
  return row ?? null;
}

/**
 * Like `searchByAssetId` but throws `ItemNotFoundError` if no row matches.
 * Use when the caller already knows the asset ID is supposed to exist.
 */
export function getByAssetId(db: InventoryDb, assetId: string): InventoryRow {
  const row = searchByAssetId(db, assetId);
  if (!row) throw new ItemNotFoundError(assetId);
  return row;
}

/** Count inventory items whose assetId starts with the given prefix (case-insensitive). */
export function countByAssetPrefix(db: InventoryDb, prefix: string): number {
  const [result] = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(homeInventory)
    .where(sql`LOWER(${homeInventory.assetId}) LIKE LOWER(${prefix + '%'})`)
    .all();
  return result?.count ?? 0;
}

/** Return distinct item types that exist in the database, sorted ascending. */
export function distinctTypes(db: InventoryDb): string[] {
  const rows = db
    .selectDistinct({ type: homeInventory.type })
    .from(homeInventory)
    .where(isNotNull(homeInventory.type))
    .orderBy(homeInventory.type)
    .all();
  return rows.map((r) => r.type).filter((t): t is string => t !== null);
}

/** Create a new inventory item. Returns the created row. */
export function create(db: InventoryDb, input: CreateItemInput): InventoryRow {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(homeInventory)
    .values(buildCreateValues(id, now, input))
    .run();

  return get(db, id);
}

/** Update an existing inventory item. Returns the updated row. */
export function update(db: InventoryDb, id: string, input: UpdateItemInput): InventoryRow {
  get(db, id);

  const updates = buildUpdateValues(input);
  if (updates) {
    db.update(homeInventory).set(updates).where(eq(homeInventory.id, id)).run();
  }

  return get(db, id);
}

/** Delete an inventory item by ID. Throws `ItemNotFoundError` if missing. */
function deleteItem(db: InventoryDb, id: string): void {
  get(db, id);
  const result = db.delete(homeInventory).where(eq(homeInventory.id, id)).run();
  if (result.changes === 0) throw new ItemNotFoundError(id);
}

export { deleteItem as delete };
