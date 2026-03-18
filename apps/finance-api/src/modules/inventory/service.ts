/**
 * Inventory service — CRUD operations against Notion and SQLite.
 * Notion is the source of truth. All writes go to Notion first, then sync to SQLite.
 * All SQL uses parameterized queries (no string interpolation).
 */
import { getDb } from "../../db.js";
import { NotFoundError } from "../../shared/errors.js";
import { getNotionClient, getHomeInventoryId, type NotionCreateProperties } from "../../shared/notion-client.js";
import { buildInventoryUpdateProperties } from "./inventory-notion-helpers.js";
import type { InventoryRow, CreateInventoryItemInput, UpdateInventoryItemInput } from "./types.js";

/** Count + rows for a paginated list. */
export interface InventoryListResult {
  rows: InventoryRow[];
  total: number;
}

/** List inventory items with optional filters. */
export function listInventoryItems(
  search: string | undefined,
  room: string | undefined,
  type: string | undefined,
  condition: string | undefined,
  inUse: boolean | undefined,
  deductible: boolean | undefined,
  limit: number,
  offset: number
): InventoryListResult {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (search) {
    conditions.push("item_name LIKE @search");
    params["search"] = `%${search}%`;
  }
  if (room) {
    conditions.push("room = @room");
    params["room"] = room;
  }
  if (type) {
    conditions.push("type = @type");
    params["type"] = type;
  }
  if (condition) {
    conditions.push("condition = @condition");
    params["condition"] = condition;
  }
  if (inUse !== undefined) {
    conditions.push("in_use = @inUse");
    params["inUse"] = inUse ? 1 : 0;
  }
  if (deductible !== undefined) {
    conditions.push("deductible = @deductible");
    params["deductible"] = deductible ? 1 : 0;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(`SELECT * FROM home_inventory ${where} ORDER BY item_name LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as InventoryRow[];

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM home_inventory ${where}`)
    .get(params) as { total: number };

  return { rows, total: countRow.total };
}

/** Get a single inventory item by id. Throws NotFoundError if missing. */
export function getInventoryItem(id: string): InventoryRow {
  const db = getDb();
  const row = db.prepare("SELECT * FROM home_inventory WHERE id = ?").get(id) as
    | InventoryRow
    | undefined;

  if (!row) throw new NotFoundError("Inventory item", id);
  return row;
}

/**
 * Create a new inventory item. Returns the created row.
 *
 * Flow:
 * 1. Create page in Notion
 * 2. Insert into SQLite using Notion's response
 * 3. Return created row
 */
export async function createInventoryItem(input: CreateInventoryItemInput): Promise<InventoryRow> {
  const db = getDb();

  // Build Notion properties
  const properties: NotionCreateProperties = {
    "Item Name": {
      title: [{ text: { content: input.itemName } }],
    },
    "In-use": {
      checkbox: input.inUse ?? false,
    },
    Deductible: {
      checkbox: input.deductible ?? false,
    },
  };

  if (input.brand) {
    properties["Brand/Manufacturer"] = { rich_text: [{ text: { content: input.brand } }] };
  }
  if (input.model) {
    properties.Model = { rich_text: [{ text: { content: input.model } }] };
  }
  if (input.itemId) {
    properties.ID = { rich_text: [{ text: { content: input.itemId } }] };
  }
  if (input.room) {
    properties.Room = { select: { name: input.room } };
  }
  if (input.location) {
    properties.Location = { select: { name: input.location } };
  }
  if (input.type) {
    properties.Type = { select: { name: input.type } };
  }
  if (input.condition) {
    properties.Condition = { select: { name: input.condition } };
  }
  if (input.purchaseDate) {
    properties["Purchase Date"] = { date: { start: input.purchaseDate } };
  }
  if (input.warrantyExpires) {
    properties["Warranty Expires"] = { date: { start: input.warrantyExpires } };
  }
  if (input.replacementValue !== undefined && input.replacementValue !== null) {
    properties["Est. Replacement Value"] = { number: input.replacementValue };
  }
  if (input.resaleValue !== undefined && input.resaleValue !== null) {
    properties["Est. Resale Value"] = { number: input.resaleValue };
  }
  if (input.purchaseTransactionId) {
    properties["Purchase Transaction"] = { relation: [{ id: input.purchaseTransactionId }] };
  }
  if (input.purchasedFromId) {
    properties["Purchased From"] = { relation: [{ id: input.purchasedFromId }] };
  }

  // 1. Create in Notion
  const notion = getNotionClient();
  const response = await notion.pages.create({
    parent: { database_id: getHomeInventoryId() },
    properties,
  });

  const now = new Date().toISOString();

  // 2. Insert into SQLite using Notion's ID
  const id = crypto.randomUUID();
  db.prepare(
    `
    INSERT INTO home_inventory (
      id, notion_id, item_name, brand, model, item_id, room, location, type, condition,
      in_use, deductible, purchase_date, warranty_expires, replacement_value, resale_value,
      purchase_transaction_id, purchased_from_id, purchased_from_name, last_edited_time
    )
    VALUES (
      @id, @notionId, @itemName, @brand, @model, @itemId, @room, @location, @type, @condition,
      @inUse, @deductible, @purchaseDate, @warrantyExpires, @replacementValue, @resaleValue,
      @purchaseTransactionId, @purchasedFromId, @purchasedFromName, @lastEditedTime
    )
  `
  ).run({
    id,
    notionId: response.id,
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
    lastEditedTime: now,
  });

  return getInventoryItem(id);
}

/**
 * Update an existing inventory item. Returns the updated row.
 *
 * Flow:
 * 1. Verify item exists in SQLite
 * 2. Update page in Notion
 * 3. Update SQLite with same data
 * 4. Return updated row
 */
export async function updateInventoryItem(
  id: string,
  input: UpdateInventoryItemInput
): Promise<InventoryRow> {
  const db = getDb();

  // Verify it exists first
  getInventoryItem(id);

  // Build Notion properties update
  const properties = buildInventoryUpdateProperties(input);

  // 1. Update in Notion
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: id,
    properties,
  });

  // 2. Update in SQLite
  const fields: string[] = [];
  const params: Record<string, string | number | null> = { id };

  if (input.itemName !== undefined) {
    fields.push("item_name = @itemName");
    params["itemName"] = input.itemName;
  }
  if (input.brand !== undefined) {
    fields.push("brand = @brand");
    params["brand"] = input.brand ?? null;
  }
  if (input.model !== undefined) {
    fields.push("model = @model");
    params["model"] = input.model ?? null;
  }
  if (input.itemId !== undefined) {
    fields.push("item_id = @itemId");
    params["itemId"] = input.itemId ?? null;
  }
  if (input.room !== undefined) {
    fields.push("room = @room");
    params["room"] = input.room ?? null;
  }
  if (input.location !== undefined) {
    fields.push("location = @location");
    params["location"] = input.location ?? null;
  }
  if (input.type !== undefined) {
    fields.push("type = @type");
    params["type"] = input.type ?? null;
  }
  if (input.condition !== undefined) {
    fields.push("condition = @condition");
    params["condition"] = input.condition ?? null;
  }
  if (input.inUse !== undefined) {
    fields.push("in_use = @inUse");
    params["inUse"] = input.inUse ? 1 : 0;
  }
  if (input.deductible !== undefined) {
    fields.push("deductible = @deductible");
    params["deductible"] = input.deductible ? 1 : 0;
  }
  if (input.purchaseDate !== undefined) {
    fields.push("purchase_date = @purchaseDate");
    params["purchaseDate"] = input.purchaseDate ?? null;
  }
  if (input.warrantyExpires !== undefined) {
    fields.push("warranty_expires = @warrantyExpires");
    params["warrantyExpires"] = input.warrantyExpires ?? null;
  }
  if (input.replacementValue !== undefined) {
    fields.push("replacement_value = @replacementValue");
    params["replacementValue"] = input.replacementValue ?? null;
  }
  if (input.resaleValue !== undefined) {
    fields.push("resale_value = @resaleValue");
    params["resaleValue"] = input.resaleValue ?? null;
  }
  if (input.purchaseTransactionId !== undefined) {
    fields.push("purchase_transaction_id = @purchaseTransactionId");
    params["purchaseTransactionId"] = input.purchaseTransactionId ?? null;
  }
  if (input.purchasedFromId !== undefined) {
    fields.push("purchased_from_id = @purchasedFromId");
    params["purchasedFromId"] = input.purchasedFromId ?? null;
  }
  if (input.purchasedFromName !== undefined) {
    fields.push("purchased_from_name = @purchasedFromName");
    params["purchasedFromName"] = input.purchasedFromName ?? null;
  }

  if (fields.length > 0) {
    fields.push("last_edited_time = @lastEditedTime");
    params["lastEditedTime"] = new Date().toISOString();

    db.prepare(`UPDATE home_inventory SET ${fields.join(", ")} WHERE id = @id`).run(params);
  }

  return getInventoryItem(id);
}

/**
 * Delete an inventory item by ID. Throws NotFoundError if missing.
 *
 * Flow:
 * 1. Archive page in Notion
 * 2. Delete from SQLite
 */
export async function deleteInventoryItem(id: string): Promise<void> {
  const db = getDb();

  // Verify it exists first
  getInventoryItem(id);

  // 1. Archive in Notion
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: id,
    archived: true,
  });

  // 2. Delete from SQLite
  const result = db.prepare("DELETE FROM home_inventory WHERE id = ?").run(id);
  if (result.changes === 0) throw new NotFoundError("Inventory item", id);
}
