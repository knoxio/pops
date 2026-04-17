import { and, asc, count, eq, like } from 'drizzle-orm';

/**
 * Wish list service — CRUD operations against SQLite via Drizzle ORM.
 * SQLite is the source of truth. All operations are local.
 */
import { wishList } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';

import type { CreateWishListItemInput, UpdateWishListItemInput, WishListRow } from './types.js';

/** Count + rows for a paginated list. */
export interface WishListListResult {
  rows: WishListRow[];
  total: number;
}

/** List wish list items with optional search and priority filters. */
export function listWishListItems(
  search: string | undefined,
  priority: string | undefined,
  limit: number,
  offset: number
): WishListListResult {
  const db = getDrizzle();
  const conditions = [];

  if (search) {
    conditions.push(like(wishList.item, `%${search}%`));
  }
  if (priority) {
    conditions.push(eq(wishList.priority, priority));
  }

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

/** Get a single wish list item by id. Throws NotFoundError if missing. */
export function getWishListItem(id: string): WishListRow {
  const db = getDrizzle();
  const row = db.select().from(wishList).where(eq(wishList.id, id)).get();

  if (!row) throw new NotFoundError('Wish list item', id);
  return row;
}

/**
 * Create a new wish list item. Returns the created row.
 * Generates a local UUID and inserts directly into SQLite.
 */
export function createWishListItem(input: CreateWishListItemInput): WishListRow {
  const db = getDrizzle();
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

  return getWishListItem(id);
}

/**
 * Update an existing wish list item. Returns the updated row.
 * Updates directly in SQLite.
 */
export function updateWishListItem(id: string, input: UpdateWishListItemInput): WishListRow {
  const db = getDrizzle();

  // Verify it exists first
  getWishListItem(id);

  const updates: Partial<typeof wishList.$inferInsert> = {};
  let hasUpdates = false;

  if (input.item !== undefined) {
    updates.item = input.item;
    hasUpdates = true;
  }
  if (input.targetAmount !== undefined) {
    updates.targetAmount = input.targetAmount ?? null;
    hasUpdates = true;
  }
  if (input.saved !== undefined) {
    updates.saved = input.saved ?? null;
    hasUpdates = true;
  }
  if (input.priority !== undefined) {
    updates.priority = input.priority ?? null;
    hasUpdates = true;
  }
  if (input.url !== undefined) {
    updates.url = input.url ?? null;
    hasUpdates = true;
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes ?? null;
    hasUpdates = true;
  }

  if (hasUpdates) {
    updates.lastEditedTime = new Date().toISOString();
    db.update(wishList).set(updates).where(eq(wishList.id, id)).run();
  }

  return getWishListItem(id);
}

/**
 * Delete a wish list item by ID. Throws NotFoundError if missing.
 * Deletes directly from SQLite.
 */
export function deleteWishListItem(id: string): void {
  // Verify it exists first
  getWishListItem(id);

  const db = getDrizzle();
  const result = db.delete(wishList).where(eq(wishList.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Wish list item', id);
}
