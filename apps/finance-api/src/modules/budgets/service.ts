/**
 * Budget service — CRUD operations against Notion and SQLite.
 * Notion is the source of truth. All writes go to Notion first, then sync to SQLite.
 * All SQL uses parameterized queries (no string interpolation).
 */
import { getDb } from "../../db.js";
import { NotFoundError, ConflictError } from "../../shared/errors.js";
import { getNotionClient, getBudgetId, type NotionUpdateProperties } from "../../shared/notion-client.js";
import type { BudgetRow, CreateBudgetInput, UpdateBudgetInput } from "./types.js";

/** Count + rows for a paginated list. */
export interface BudgetListResult {
  rows: BudgetRow[];
  total: number;
}

/**
 * List budgets with optional filters.
 * @param search - LIKE search on category field
 * @param period - Exact match on period field
 * @param active - Filter by active status (boolean)
 */
export function listBudgets(
  search: string | undefined,
  period: string | undefined,
  active: boolean | undefined,
  limit: number,
  offset: number
): BudgetListResult {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (search) {
    conditions.push("category LIKE @search");
    params["search"] = `%${search}%`;
  }
  if (period) {
    conditions.push("period = @period");
    params["period"] = period;
  }
  if (active !== undefined) {
    conditions.push("active = @active");
    params["active"] = active ? 1 : 0;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(`SELECT * FROM budgets ${where} ORDER BY category LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as BudgetRow[];

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM budgets ${where}`).get(params) as {
    total: number;
  };

  return { rows, total: countRow.total };
}

/** Get a single budget by id. Throws NotFoundError if missing. */
export function getBudget(id: string): BudgetRow {
  const db = getDb();
  const row = db.prepare("SELECT * FROM budgets WHERE id = ?").get(id) as
    | BudgetRow
    | undefined;

  if (!row) throw new NotFoundError("Budget", id);
  return row;
}

/**
 * Create a new budget. Returns the created row.
 * Throws ConflictError if a budget with the same category+period combination already exists.
 *
 * Flow:
 * 1. Check for duplicates in SQLite
 * 2. Create page in Notion
 * 3. Insert into SQLite using Notion's response
 * 4. Return created row
 */
export async function createBudget(input: CreateBudgetInput): Promise<BudgetRow> {
  const db = getDb();

  // Check for duplicate category+period combination
  const existing = db
    .prepare(
      "SELECT id FROM budgets WHERE category = ? AND (period = ? OR (period IS NULL AND ? IS NULL))"
    )
    .get(input.category, input.period ?? null, input.period ?? null) as
    | { id: string }
    | undefined;

  if (existing) {
    const periodDesc = input.period ? `'${input.period}'` : "null";
    throw new ConflictError(
      `Budget with category '${input.category}' and period ${periodDesc} already exists`
    );
  }

  // 1. Create in Notion
  const notion = getNotionClient();
  const response = await notion.pages.create({
    parent: { database_id: getBudgetId() },
    properties: {
      Category: {
        title: [{ text: { content: input.category } }],
      },
      Period: input.period
        ? { rich_text: [{ text: { content: input.period } }] }
        : { rich_text: [] },
      Amount:
        input.amount !== undefined && input.amount !== null
          ? { number: input.amount }
          : { number: null },
      Active: {
        checkbox: input.active ?? false,
      },
      Notes: input.notes ? { rich_text: [{ text: { content: input.notes } }] } : { rich_text: [] },
    },
  });

  const now = new Date().toISOString();

  // 2. Insert into SQLite using Notion's ID
  const id = crypto.randomUUID();
  db.prepare(
    `
    INSERT INTO budgets (id, notion_id, category, period, amount, active, notes, last_edited_time)
    VALUES (@id, @notionId, @category, @period, @amount, @active, @notes, @lastEditedTime)
  `
  ).run({
    id,
    notionId: response.id,
    category: input.category,
    period: input.period ?? null,
    amount: input.amount ?? null,
    active: input.active ? 1 : 0,
    notes: input.notes ?? null,
    lastEditedTime: now,
  });

  return getBudget(id);
}

/**
 * Update an existing budget. Returns the updated row.
 *
 * Flow:
 * 1. Verify budget exists in SQLite
 * 2. Update page in Notion
 * 3. Update SQLite with same data
 * 4. Return updated row
 */
export async function updateBudget(id: string, input: UpdateBudgetInput): Promise<BudgetRow> {
  const db = getDb();

  // Verify it exists first
  getBudget(id);

  // Build Notion properties update
  const properties: NotionUpdateProperties = {};

  if (input.category !== undefined) {
    properties.Category = {
      title: [{ text: { content: input.category } }],
    };
  }
  if (input.period !== undefined) {
    properties.Period = input.period
      ? { rich_text: [{ text: { content: input.period } }] }
      : { rich_text: [] };
  }
  if (input.amount !== undefined) {
    properties.Amount = input.amount !== null ? { number: input.amount } : { number: null };
  }
  if (input.active !== undefined) {
    properties.Active = {
      checkbox: input.active,
    };
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

  if (input.category !== undefined) {
    fields.push("category = @category");
    params["category"] = input.category;
  }
  if (input.period !== undefined) {
    fields.push("period = @period");
    params["period"] = input.period ?? null;
  }
  if (input.amount !== undefined) {
    fields.push("amount = @amount");
    params["amount"] = input.amount ?? null;
  }
  if (input.active !== undefined) {
    fields.push("active = @active");
    params["active"] = input.active ? 1 : 0;
  }
  if (input.notes !== undefined) {
    fields.push("notes = @notes");
    params["notes"] = input.notes ?? null;
  }

  if (fields.length > 0) {
    fields.push("last_edited_time = @lastEditedTime");
    params["lastEditedTime"] = new Date().toISOString();

    db.prepare(`UPDATE budgets SET ${fields.join(", ")} WHERE id = @id`).run(params);
  }

  return getBudget(id);
}

/**
 * Delete a budget by ID. Throws NotFoundError if missing.
 *
 * Flow:
 * 1. Archive page in Notion (Notion doesn't truly delete, it archives)
 * 2. Delete from SQLite
 */
export async function deleteBudget(id: string): Promise<void> {
  const db = getDb();

  // Verify it exists first
  getBudget(id);

  // 1. Archive in Notion
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: id,
    archived: true,
  });

  // 2. Delete from SQLite
  const result = db.prepare("DELETE FROM budgets WHERE id = ?").run(id);
  if (result.changes === 0) throw new NotFoundError("Budget", id);
}
