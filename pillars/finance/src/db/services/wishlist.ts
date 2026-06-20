/**
 * Wish list CRUD against finance's SQLite via drizzle.
 *
 * The in-tree service in `apps/pops-api/src/modules/finance/wishlist/`
 * still uses `getDrizzle()`; this package version takes a `FinanceDb`
 * handle as its first argument. The cutover (PR 3 of phase 1) flips
 * pops-api to call into here.
 *
 * Follows the standard service pattern: db-arg services, typed domain
 * errors, no HTTP concerns.
 */
import { and, asc, count, eq, like } from 'drizzle-orm';

import { WishListItemNotFoundError } from '../errors.js';
import { wishList } from '../schema.js';

import type { FinanceDb } from './internal.js';

/**
 * Wish list priority levels. Defined locally so the finance pillar package
 * does not need a workspace dependency on `@pops/db-types`, which would
 * create a literal cycle once db-types adds `@pops/finance-db` to its
 * re-export shim (PRD-245 US-03). The canonical contract-level constant
 * lives in `@pops/finance-contract`; `@pops/db-types/constants` re-exports
 * the same tuple for legacy callers.
 */
export const WISH_LIST_PRIORITIES = ['Needing', 'Soon', 'One Day', 'Dreaming'] as const;
export type WishListPriority = (typeof WISH_LIST_PRIORITIES)[number];

/** Raw drizzle row shape. */
export type WishListRow = typeof wishList.$inferSelect;

/** Mutable subset accepted on create. `notionId` stays the import/sync layer's job. */
export interface CreateWishListItemInput {
  item: string;
  targetAmount?: number | null;
  saved?: number | null;
  priority?: WishListPriority | null;
  url?: string | null;
  notes?: string | null;
}

/** Same shape as create — all fields optional for PATCH semantics. */
export interface UpdateWishListItemInput {
  item?: string;
  targetAmount?: number | null;
  saved?: number | null;
  priority?: WishListPriority | null;
  url?: string | null;
  notes?: string | null;
}

/** Result of a paginated `list` call. */
export interface WishListListResult {
  rows: WishListRow[];
  total: number;
}

/** Filters + pagination accepted by `listWishListItems`. */
export interface WishListQuery {
  search?: string | undefined;
  priority?: WishListPriority | undefined;
  limit: number;
  offset: number;
}

/** List wish list items with optional search + priority filters and a count. */
export function listWishListItems(db: FinanceDb, query: WishListQuery): WishListListResult {
  const { search, priority, limit, offset } = query;
  const conditions = [];
  if (search) conditions.push(like(wishList.item, `%${search}%`));
  if (priority) conditions.push(eq(wishList.priority, priority));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(wishList)
    .where(where)
    .orderBy(asc(wishList.item))
    .limit(limit)
    .offset(offset)
    .all();
  const countRow = db.select({ total: count() }).from(wishList).where(where).all()[0];
  const total = countRow?.total ?? 0;

  return { rows, total };
}

/** Get a single wish list item by id. Throws `WishListItemNotFoundError` if missing. */
export function getWishListItem(db: FinanceDb, id: string): WishListRow {
  const row = db.select().from(wishList).where(eq(wishList.id, id)).get();
  if (!row) throw new WishListItemNotFoundError(id);
  return row;
}

/** Create a new wish list item. Generates a UUID and returns the persisted row. */
export function createWishListItem(db: FinanceDb, input: CreateWishListItemInput): WishListRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(wishList)
    .values({
      id,
      item: input.item,
      targetAmount: input.targetAmount ?? null,
      saved: input.saved ?? null,
      priority: input.priority ?? null,
      url: input.url ?? null,
      notes: input.notes ?? null,
      lastEditedTime: now,
    })
    .run();

  return getWishListItem(db, id);
}

function buildWishListUpdates(
  input: UpdateWishListItemInput
): Partial<typeof wishList.$inferInsert> {
  const updates: Partial<typeof wishList.$inferInsert> = {};
  if (input.item !== undefined) updates.item = input.item;
  if (input.targetAmount !== undefined) updates.targetAmount = input.targetAmount ?? null;
  if (input.saved !== undefined) updates.saved = input.saved ?? null;
  if (input.priority !== undefined) updates.priority = input.priority ?? null;
  if (input.url !== undefined) updates.url = input.url ?? null;
  if (input.notes !== undefined) updates.notes = input.notes ?? null;
  return updates;
}

/**
 * Patch a wish list item. Throws `WishListItemNotFoundError` if missing.
 * No-op writes (empty `input`) still re-read the row but skip the UPDATE.
 */
export function updateWishListItem(
  db: FinanceDb,
  id: string,
  input: UpdateWishListItemInput
): WishListRow {
  getWishListItem(db, id);

  const updates = buildWishListUpdates(input);
  if (Object.keys(updates).length > 0) {
    updates.lastEditedTime = new Date().toISOString();
    db.update(wishList).set(updates).where(eq(wishList.id, id)).run();
  }

  return getWishListItem(db, id);
}

/** Delete a wish list item. Throws `WishListItemNotFoundError` if missing. */
export function deleteWishListItem(db: FinanceDb, id: string): void {
  getWishListItem(db, id);
  const result = db.delete(wishList).where(eq(wishList.id, id)).run();
  if (result.changes === 0) throw new WishListItemNotFoundError(id);
}
