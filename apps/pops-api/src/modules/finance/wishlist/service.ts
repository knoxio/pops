/**
 * Wish list service — CRUD operations against SQLite via Drizzle ORM.
 * SQLite is the source of truth. All operations are local.
 */
import { eq, and, like, asc, count } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { wishList } from "../../../db/schema/wishlist.js";
import { NotFoundError } from "../../../shared/errors.js";
import type { WishListRow, CreateWishListItemInput, UpdateWishListItemInput } from "./types.js";

/** Map a Drizzle select result back to the snake_case WishListRow expected by the router. */
type DrizzleWishList = typeof wishList.$inferSelect;
function toRow(r: DrizzleWishList): WishListRow {
  return {
    id: r.id,
    notion_id: r.notionId,
    item: r.item,
    target_amount: r.targetAmount,
    saved: r.saved,
    priority: r.priority,
    url: r.url,
    notes: r.notes,
    last_edited_time: r.lastEditedTime,
  };
}

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
    .all()
    .map(toRow);

  const [{ total }] = db
    .select({ total: count() })
    .from(wishList)
    .where(where)
    .all();

  return { rows, total };
}

/** Get a single wish list item by id. Throws NotFoundError if missing. */
export function getWishListItem(id: string): WishListRow {
  const db = getDrizzle();
  const row = db
    .select()
    .from(wishList)
    .where(eq(wishList.id, id))
    .get();

  if (!row) throw new NotFoundError("Wish list item", id);
  return toRow(row);
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
export function updateWishListItem(
  id: string,
  input: UpdateWishListItemInput
): WishListRow {
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
  if (result.changes === 0) throw new NotFoundError("Wish list item", id);
}
