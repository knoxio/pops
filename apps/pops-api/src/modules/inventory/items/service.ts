/**
 * Inventory service — CRUD operations against SQLite.
 * SQLite is the source of truth. All operations are local.
 * All SQL uses parameterized queries (no string interpolation).
 */
import crypto from "crypto";
import { getDb } from "../../../db.js";
import { NotFoundError } from "../../../shared/errors.js";
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
 * Generates a local UUID and inserts directly into SQLite.
 */
export function createInventoryItem(input: CreateInventoryItemInput): InventoryRow {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO home_inventory (
      id, item_name, brand, model, item_id, room, location, type, condition,
      in_use, deductible, purchase_date, warranty_expires, replacement_value, resale_value,
      purchase_transaction_id, purchased_from_id, purchased_from_name, last_edited_time
    )
    VALUES (
      @id, @itemName, @brand, @model, @itemId, @room, @location, @type, @condition,
      @inUse, @deductible, @purchaseDate, @warrantyExpires, @replacementValue, @resaleValue,
      @purchaseTransactionId, @purchasedFromId, @purchasedFromName, @lastEditedTime
    )
  `
  ).run({
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
    lastEditedTime: now,
  });

  return getInventoryItem(id);
}

/**
 * Update an existing inventory item. Returns the updated row.
 * Updates directly in SQLite.
 */
export function updateInventoryItem(
  id: string,
  input: UpdateInventoryItemInput
): InventoryRow {
  const db = getDb();

  // Verify it exists first
  getInventoryItem(id);

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

    db.prepare(`UPDATE home_inventory SET ${fields.join(", ")} WHERE id = @id`).run(
      params
    );
  }

  return getInventoryItem(id);
}

/**
 * Delete an inventory item by ID. Throws NotFoundError if missing.
 * Deletes directly from SQLite.
 */
export function deleteInventoryItem(id: string): void {
  const db = getDb();

  // Verify it exists first
  getInventoryItem(id);

  const result = db.prepare("DELETE FROM home_inventory WHERE id = ?").run(id);
  if (result.changes === 0) throw new NotFoundError("Inventory item", id);
}
