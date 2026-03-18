/**
 * Transaction service — CRUD operations against Notion and SQLite.
 * Notion is the source of truth. All writes go to Notion first, then sync to SQLite.
 * All SQL uses parameterized queries (no string interpolation).
 */
import { getDb } from "../../db.js";
import { NotFoundError } from "../../shared/errors.js";
import { getNotionClient, getBalanceSheetId, type NotionCreateProperties } from "../../shared/notion-client.js";
import { buildTransactionUpdateProperties } from "./transaction-notion-helpers.js";
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
 *
 * Flow:
 * 1. Create page in Notion
 * 2. Insert into SQLite using Notion's response
 * 3. Return created row
 */
export async function createTransaction(input: CreateTransactionInput): Promise<TransactionRow> {
  const db = getDb();

  // Build Notion properties
  const properties: NotionCreateProperties = {
    Description: {
      title: [{ text: { content: input.description } }],
    },
    Account: {
      select: { name: input.account },
    },
    Amount: {
      number: input.amount,
    },
    Date: {
      date: { start: input.date },
    },
    Type: {
      select: { name: input.type || "Expense" },
    },
    Tags: {
      multi_select: input.tags?.length ? input.tags.map((tag) => ({ name: tag })) : [],
    },
  };

  if (input.entityId) {
    properties.Entity = { relation: [{ id: input.entityId }] };
  }
  if (input.location) {
    properties.Location = { select: { name: input.location } };
  }
  if (input.country) {
    properties.Country = { select: { name: input.country } };
  }
  if (input.relatedTransactionId) {
    properties["Related Transaction"] = { relation: [{ id: input.relatedTransactionId }] };
  }
  if (input.notes) {
    properties.Notes = { rich_text: [{ text: { content: input.notes } }] };
  }
  if (input.rawRow) {
    properties["Raw Row"] = { rich_text: [{ text: { content: input.rawRow.substring(0, 2000) } }] };
  }
  if (input.checksum) {
    properties.Checksum = { rich_text: [{ text: { content: input.checksum } }] };
  }

  // 1. Create in Notion
  const notion = getNotionClient();
  const response = await notion.pages.create({
    parent: { database_id: getBalanceSheetId() },
    properties,
  });

  const now = new Date().toISOString();

  // 2. Insert into SQLite using Notion's ID
  const id = crypto.randomUUID();
  db.prepare(
    `
    INSERT INTO transactions (
      id, notion_id, description, account, amount, date, type, tags,
      entity_id, entity_name, location, country,
      related_transaction_id, notes, last_edited_time
    )
    VALUES (
      @id, @notionId, @description, @account, @amount, @date, @type, @tags,
      @entityId, @entityName, @location, @country,
      @relatedTransactionId, @notes, @lastEditedTime
    )
  `
  ).run({
    id,
    notionId: response.id,
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
    lastEditedTime: now,
  });

  return getTransaction(id);
}

/**
 * Update an existing transaction. Returns the updated row.
 *
 * Flow:
 * 1. Verify transaction exists in SQLite
 * 2. Update page in Notion
 * 3. Update SQLite with same data
 * 4. Return updated row
 */
export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput
): Promise<TransactionRow> {
  const db = getDb();

  // Verify it exists first
  getTransaction(id);

  // Build Notion properties update
  const properties = buildTransactionUpdateProperties(input);

  // 1. Update in Notion
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: id,
    properties,
  });

  // 2. Update in SQLite
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

    db.prepare(`UPDATE transactions SET ${fields.join(", ")} WHERE id = @id`).run(params);
  }

  return getTransaction(id);
}

/**
 * Delete a transaction by ID. Throws NotFoundError if missing.
 *
 * Flow:
 * 1. Archive page in Notion
 * 2. Delete from SQLite
 */
export async function deleteTransaction(id: string): Promise<void> {
  const db = getDb();

  // Verify it exists first
  getTransaction(id);

  // 1. Archive in Notion
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: id,
    archived: true,
  });

  // 2. Delete from SQLite
  const result = db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  if (result.changes === 0) throw new NotFoundError("Transaction", id);
}
