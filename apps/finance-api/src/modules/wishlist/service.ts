/**
 * Wish list service — CRUD operations against Notion and SQLite.
 * Notion is the source of truth. All writes go to Notion first, then sync to SQLite.
 * All SQL uses parameterized queries (no string interpolation).
 */
import { getDb } from "../../db.js";
import { NotFoundError } from "../../shared/errors.js";
import {
  getNotionClient,
  getWishListId,
  type NotionCreateProperties,
  type NotionUpdateProperties,
} from "../../shared/notion-client.js";
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
 *
 * Flow:
 * 1. Create page in Notion
 * 2. Insert into SQLite using Notion's response
 * 3. Return created row
 */
export async function createWishListItem(input: CreateWishListItemInput): Promise<WishListRow> {
  const db = getDb();

  // Build Notion properties
  const properties: NotionCreateProperties = {
    Item: {
      title: [{ text: { content: input.item } }],
    },
  };

  if (input.targetAmount !== undefined && input.targetAmount !== null) {
    properties["Target Amount"] = { number: input.targetAmount };
  }
  if (input.saved !== undefined && input.saved !== null) {
    properties.Saved = { number: input.saved };
  }
  if (input.priority) {
    properties.Priority = { select: { name: input.priority } };
  }
  if (input.url) {
    properties.URL = { url: input.url };
  }
  if (input.notes) {
    properties.Notes = { rich_text: [{ text: { content: input.notes } }] };
  }

  // 1. Create in Notion
  const notion = getNotionClient();
  const response = await notion.pages.create({
    parent: { database_id: getWishListId() },
    properties,
  });

  const now = new Date().toISOString();

  // 2. Insert into SQLite using Notion's ID
  const id = crypto.randomUUID();
  db.prepare(
    `
    INSERT INTO wish_list (id, notion_id, item, target_amount, saved, priority, url, notes, last_edited_time)
    VALUES (@id, @notionId, @item, @targetAmount, @saved, @priority, @url, @notes, @lastEditedTime)
  `
  ).run({
    id,
    notionId: response.id,
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
 *
 * Flow:
 * 1. Verify item exists in SQLite
 * 2. Update page in Notion
 * 3. Update SQLite with same data
 * 4. Return updated row
 */
export async function updateWishListItem(
  id: string,
  input: UpdateWishListItemInput
): Promise<WishListRow> {
  const db = getDb();

  // Verify it exists first
  getWishListItem(id);

  // Build Notion properties update
  const properties: NotionUpdateProperties = {};

  if (input.item !== undefined) {
    properties.Item = {
      title: [{ text: { content: input.item } }],
    };
  }
  if (input.targetAmount !== undefined) {
    properties["Target Amount"] =
      input.targetAmount !== null ? { number: input.targetAmount } : { number: null };
  }
  if (input.saved !== undefined) {
    properties.Saved = input.saved !== null ? { number: input.saved } : { number: null };
  }
  if (input.priority !== undefined) {
    properties.Priority = input.priority ? { select: { name: input.priority } } : { select: null };
  }
  if (input.url !== undefined) {
    properties.URL = input.url ? { url: input.url } : { url: null };
  }
  if (input.notes !== undefined) {
    properties.Notes = input.notes
      ? { rich_text: [{ text: { content: input.notes } }] }
      : { rich_text: [] };
  }

  // 1. Update in Notion
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: id,
    properties,
  });

  // 2. Update in SQLite
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
 *
 * Flow:
 * 1. Archive page in Notion
 * 2. Delete from SQLite
 */
export async function deleteWishListItem(id: string): Promise<void> {
  const db = getDb();

  // Verify it exists first
  getWishListItem(id);

  // 1. Archive in Notion
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: id,
    archived: true,
  });

  // 2. Delete from SQLite
  const result = db.prepare("DELETE FROM wish_list WHERE id = ?").run(id);
  if (result.changes === 0) throw new NotFoundError("Wish list item", id);
}
