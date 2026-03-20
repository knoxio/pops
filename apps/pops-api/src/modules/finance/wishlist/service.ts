/**
 * Wish list service — CRUD operations against SQLite.
 * SQLite is the source of truth. All operations are local.
 * All SQL uses parameterized queries (no string interpolation).
 */
import crypto from "crypto";
import { getDb } from "../../../db.js";
import { NotFoundError } from "../../../shared/errors.js";
import type { WishListRow, CreateWishListItemInput, UpdateWishListItemInput } from "./types.js";

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
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (search) {
    conditions.push("item LIKE @search");
    params["search"] = `%${search}%`;
  }
  if (priority) {
    conditions.push("priority = @priority");
    params["priority"] = priority;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(`SELECT * FROM wish_list ${where} ORDER BY item LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as WishListRow[];

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM wish_list ${where}`).get(params) as {
    total: number;
  };

  return { rows, total: countRow.total };
}

/** Get a single wish list item by id. Throws NotFoundError if missing. */
export function getWishListItem(id: string): WishListRow {
  const db = getDb();
  const row = db.prepare("SELECT * FROM wish_list WHERE id = ?").get(id) as
    | WishListRow
    | undefined;

  if (!row) throw new NotFoundError("Wish list item", id);
  return row;
}

/**
 * Create a new wish list item. Returns the created row.
 * Generates a local UUID and inserts directly into SQLite.
 */
export function createWishListItem(input: CreateWishListItemInput): WishListRow {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO wish_list (id, item, target_amount, saved, priority, url, notes, last_edited_time)
    VALUES (@id, @item, @targetAmount, @saved, @priority, @url, @notes, @lastEditedTime)
  `
  ).run({
    id,
    item: input.item,
    targetAmount: input.targetAmount ?? null,
    saved: input.saved ?? null,
    priority: input.priority ?? null,
    url: input.url ?? null,
    notes: input.notes ?? null,
    lastEditedTime: now,
  });

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
  const db = getDb();

  // Verify it exists first
  getWishListItem(id);

  const fields: string[] = [];
  const params: Record<string, string | number | null> = { id };

  if (input.item !== undefined) {
    fields.push("item = @item");
    params["item"] = input.item;
  }
  if (input.targetAmount !== undefined) {
    fields.push("target_amount = @targetAmount");
    params["targetAmount"] = input.targetAmount ?? null;
  }
  if (input.saved !== undefined) {
    fields.push("saved = @saved");
    params["saved"] = input.saved ?? null;
  }
  if (input.priority !== undefined) {
    fields.push("priority = @priority");
    params["priority"] = input.priority ?? null;
  }
  if (input.url !== undefined) {
    fields.push("url = @url");
    params["url"] = input.url ?? null;
  }
  if (input.notes !== undefined) {
    fields.push("notes = @notes");
    params["notes"] = input.notes ?? null;
  }

  if (fields.length > 0) {
    fields.push("last_edited_time = @lastEditedTime");
    params["lastEditedTime"] = new Date().toISOString();

    db.prepare(`UPDATE wish_list SET ${fields.join(", ")} WHERE id = @id`).run(params);
  }

  return getWishListItem(id);
}

/**
 * Delete a wish list item by ID. Throws NotFoundError if missing.
 * Deletes directly from SQLite.
 */
export function deleteWishListItem(id: string): void {
  const db = getDb();

  // Verify it exists first
  getWishListItem(id);

  const result = db.prepare("DELETE FROM wish_list WHERE id = ?").run(id);
  if (result.changes === 0) throw new NotFoundError("Wish list item", id);
}
