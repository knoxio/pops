/**
 * Transaction service — CRUD operations against SQLite.
 * SQLite is the source of truth. All operations are local.
 * All SQL uses parameterized queries (no string interpolation).
 */
import crypto from "crypto";
import { getDb } from "../../db.js";
import { NotFoundError } from "../../shared/errors.js";
import type {
  TransactionRow,
  CreateTransactionInput,
  UpdateTransactionInput,
  TransactionFilters,
} from "./types.js";

/** Count + rows for a paginated list. */
export interface TransactionListResult {
  rows: TransactionRow[];
  total: number;
}

/** List transactions with optional filters. */
export function listTransactions(
  filters: TransactionFilters,
  limit: number,
  offset: number
): TransactionListResult {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.search) {
    conditions.push("description LIKE @search");
    params["search"] = `%${filters.search}%`;
  }
  if (filters.account) {
    conditions.push("account = @account");
    params["account"] = filters.account;
  }
  if (filters.startDate) {
    conditions.push("date >= @startDate");
    params["startDate"] = filters.startDate;
  }
  if (filters.endDate) {
    conditions.push("date <= @endDate");
    params["endDate"] = filters.endDate;
  }
  if (filters.tag) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(tags) WHERE json_each.value = @tag)");
    params["tag"] = filters.tag;
  }
  if (filters.entityId) {
    conditions.push("entity_id = @entityId");
    params["entityId"] = filters.entityId;
  }
  if (filters.type) {
    conditions.push("type = @type");
    params["type"] = filters.type;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as TransactionRow[];

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM transactions ${where}`)
    .get(params) as { total: number };

  return { rows, total: countRow.total };
}

/** Get a single transaction by id. Throws NotFoundError if missing. */
export function getTransaction(id: string): TransactionRow {
  const db = getDb();
  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as
    | TransactionRow
    | undefined;

  if (!row) throw new NotFoundError("Transaction", id);
  return row;
}

/**
 * Create a new transaction. Returns the created row.
 * Generates a local UUID and inserts directly into SQLite.
 */
export function createTransaction(input: CreateTransactionInput): TransactionRow {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO transactions (
      id, description, account, amount, date, type, tags,
      entity_id, entity_name, location, country,
      related_transaction_id, notes, checksum, raw_row, last_edited_time
    )
    VALUES (
      @id, @description, @account, @amount, @date, @type, @tags,
      @entityId, @entityName, @location, @country,
      @relatedTransactionId, @notes, @checksum, @rawRow, @lastEditedTime
    )
  `
  ).run({
    id,
    description: input.description,
    account: input.account,
    amount: input.amount,
    date: input.date,
    type: input.type || "",
    tags: JSON.stringify(input.tags ?? []),
    entityId: input.entityId ?? null,
    entityName: input.entityName ?? null,
    location: input.location ?? null,
    country: input.country ?? null,
    relatedTransactionId: input.relatedTransactionId ?? null,
    notes: input.notes ?? null,
    checksum: input.checksum ?? null,
    rawRow: input.rawRow ?? null,
    lastEditedTime: now,
  });

  return getTransaction(id);
}

/**
 * Update an existing transaction. Returns the updated row.
 * Updates directly in SQLite.
 */
export function updateTransaction(
  id: string,
  input: UpdateTransactionInput
): TransactionRow {
  const db = getDb();

  // Verify it exists first
  getTransaction(id);

  const fields: string[] = [];
  const params: Record<string, string | number | null> = { id };

  if (input.description !== undefined) {
    fields.push("description = @description");
    params["description"] = input.description;
  }
  if (input.account !== undefined) {
    fields.push("account = @account");
    params["account"] = input.account;
  }
  if (input.amount !== undefined) {
    fields.push("amount = @amount");
    params["amount"] = input.amount;
  }
  if (input.date !== undefined) {
    fields.push("date = @date");
    params["date"] = input.date;
  }
  if (input.type !== undefined) {
    fields.push("type = @type");
    params["type"] = input.type ?? "";
  }
  if (input.tags !== undefined) {
    fields.push("tags = @tags");
    params["tags"] = JSON.stringify(input.tags);
  }
  if (input.entityId !== undefined) {
    fields.push("entity_id = @entityId");
    params["entityId"] = input.entityId ?? null;
  }
  if (input.entityName !== undefined) {
    fields.push("entity_name = @entityName");
    params["entityName"] = input.entityName ?? null;
  }
  if (input.location !== undefined) {
    fields.push("location = @location");
    params["location"] = input.location ?? null;
  }
  if (input.country !== undefined) {
    fields.push("country = @country");
    params["country"] = input.country ?? null;
  }
  if (input.relatedTransactionId !== undefined) {
    fields.push("related_transaction_id = @relatedTransactionId");
    params["relatedTransactionId"] = input.relatedTransactionId ?? null;
  }
  if (input.notes !== undefined) {
    fields.push("notes = @notes");
    params["notes"] = input.notes ?? null;
  }

  if (fields.length > 0) {
    fields.push("last_edited_time = @lastEditedTime");
    params["lastEditedTime"] = new Date().toISOString();

    db.prepare(`UPDATE transactions SET ${fields.join(", ")} WHERE id = @id`).run(
      params
    );
  }

  return getTransaction(id);
}

/**
 * Delete a transaction by ID. Throws NotFoundError if missing.
 * Deletes directly from SQLite.
 */
export function deleteTransaction(id: string): void {
  const db = getDb();

  // Verify it exists first
  getTransaction(id);

  const result = db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  if (result.changes === 0) throw new NotFoundError("Transaction", id);
}
