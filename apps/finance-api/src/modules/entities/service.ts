/**
 * Entity service — CRUD operations against Notion and SQLite.
 * Notion is the source of truth. All writes go to Notion first, then sync to SQLite.
 * All SQL uses parameterized queries (no string interpolation).
 */
import { getDb } from "../../db.js";
import { NotFoundError, ConflictError } from "../../shared/errors.js";
import { getNotionClient, getEntitiesDbId, type NotionCreateProperties, type NotionUpdateProperties } from "../../shared/notion-client.js";
import type { EntityRow, CreateEntityInput, UpdateEntityInput } from "./types.js";

/** Count + rows for a paginated list. */
export interface EntityListResult {
  rows: EntityRow[];
  total: number;
}

/** List entities with optional search and type filters. */
export function listEntities(
  search: string | undefined,
  type: string | undefined,
  limit: number,
  offset: number
): EntityListResult {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (search) {
    conditions.push("name LIKE @search");
    params["search"] = `%${search}%`;
  }
  if (type) {
    conditions.push("type = @type");
    params["type"] = type;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(`SELECT * FROM entities ${where} ORDER BY name LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as EntityRow[];

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM entities ${where}`).get(params) as {
    total: number;
  };

  return { rows, total: countRow.total };
}

/** Get a single entity by id. Throws NotFoundError if missing. */
export function getEntity(id: string): EntityRow {
  const db = getDb();
  const row = db.prepare("SELECT * FROM entities WHERE id = ?").get(id) as
    | EntityRow
    | undefined;

  if (!row) throw new NotFoundError("Entity", id);
  return row;
}

/**
 * Create a new entity. Returns the created row.
 *
 * Flow:
 * 1. Check for duplicates in SQLite
 * 2. Create page in Notion
 * 3. Insert into SQLite using Notion's response
 * 4. Return created row
 */
export async function createEntity(input: CreateEntityInput): Promise<EntityRow> {
  const db = getDb();

  const existing = db.prepare("SELECT id FROM entities WHERE name = ?").get(input.name) as
    | { id: string }
    | undefined;
  if (existing) {
    throw new ConflictError(`Entity with name '${input.name}' already exists`);
  }

  // 1. Create in Notion
  const notion = getNotionClient();
  const properties: NotionCreateProperties = {
    Name: {
      title: [{ text: { content: input.name } }],
    },
  };

  if (input.type) {
    properties.Type = { select: { name: input.type } };
  }
  if (input.abn) {
    properties.ABN = { rich_text: [{ text: { content: input.abn } }] };
  }
  if (input.aliases?.length) {
    properties.Aliases = { rich_text: [{ text: { content: input.aliases.join(", ") } }] };
  }
  if (input.defaultTransactionType) {
    properties["Default Transaction Type"] = { select: { name: input.defaultTransactionType } };
  }
  if (input.defaultTags?.length) {
    properties["Default Tags"] = {
      multi_select: input.defaultTags.map((tag) => ({ name: tag })),
    };
  }
  if (input.notes) {
    properties.Notes = { rich_text: [{ text: { content: input.notes } }] };
  }

  const response = await notion.pages.create({
    parent: { database_id: getEntitiesDbId() },
    properties,
  });

  const now = new Date().toISOString();

  // 2. Insert into SQLite using Notion's ID
  const id = crypto.randomUUID();
  db.prepare(
    `
    INSERT INTO entities (id, notion_id, name, type, abn, aliases, default_transaction_type, default_tags, notes, last_edited_time)
    VALUES (@id, @notionId, @name, @type, @abn, @aliases, @defaultTransactionType, @defaultTags, @notes, @lastEditedTime)
  `
  ).run({
    id,
    notionId: response.id,
    name: input.name,
    type: input.type ?? null,
    abn: input.abn ?? null,
    aliases: input.aliases?.length ? input.aliases.join(", ") : null,
    defaultTransactionType: input.defaultTransactionType ?? null,
    defaultTags: input.defaultTags?.length ? JSON.stringify(input.defaultTags) : null,
    notes: input.notes ?? null,
    lastEditedTime: now,
  });

  return getEntity(id);
}

/**
 * Update an existing entity. Returns the updated row.
 *
 * Flow:
 * 1. Verify entity exists in SQLite
 * 2. Update page in Notion
 * 3. Update SQLite with same data
 * 4. Return updated row
 */
export async function updateEntity(id: string, input: UpdateEntityInput): Promise<EntityRow> {
  const db = getDb();

  // Verify it exists first
  getEntity(id);

  // Build Notion properties update
  const properties: NotionUpdateProperties = {};

  if (input.name !== undefined) {
    properties.Name = {
      title: [{ text: { content: input.name } }],
    };
  }
  if (input.type !== undefined) {
    properties.Type = input.type ? { select: { name: input.type } } : { select: null };
  }
  if (input.abn !== undefined) {
    properties.ABN = input.abn
      ? { rich_text: [{ text: { content: input.abn } }] }
      : { rich_text: [] };
  }
  if (input.aliases !== undefined) {
    properties.Aliases = input.aliases.length
      ? { rich_text: [{ text: { content: input.aliases.join(", ") } }] }
      : { rich_text: [] };
  }
  if (input.defaultTransactionType !== undefined) {
    properties["Default Transaction Type"] = input.defaultTransactionType
      ? { select: { name: input.defaultTransactionType } }
      : { select: null };
  }
  if (input.defaultTags !== undefined) {
    properties["Default Tags"] = {
      multi_select: input.defaultTags.map((tag) => ({ name: tag })),
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

  if (input.name !== undefined) {
    fields.push("name = @name");
    params["name"] = input.name;
  }
  if (input.type !== undefined) {
    fields.push("type = @type");
    params["type"] = input.type ?? null;
  }
  if (input.abn !== undefined) {
    fields.push("abn = @abn");
    params["abn"] = input.abn ?? null;
  }
  if (input.aliases !== undefined) {
    fields.push("aliases = @aliases");
    params["aliases"] = input.aliases.length ? input.aliases.join(", ") : null;
  }
  if (input.defaultTransactionType !== undefined) {
    fields.push("default_transaction_type = @defaultTransactionType");
    params["defaultTransactionType"] = input.defaultTransactionType ?? null;
  }
  if (input.defaultTags !== undefined) {
    fields.push("default_tags = @defaultTags");
    params["defaultTags"] = input.defaultTags.length ? JSON.stringify(input.defaultTags) : null;
  }
  if (input.notes !== undefined) {
    fields.push("notes = @notes");
    params["notes"] = input.notes ?? null;
  }

  if (fields.length > 0) {
    fields.push("last_edited_time = @lastEditedTime");
    params["lastEditedTime"] = new Date().toISOString();

    db.prepare(`UPDATE entities SET ${fields.join(", ")} WHERE id = @id`).run(params);
  }

  return getEntity(id);
}

/**
 * Delete an entity by ID. Throws NotFoundError if missing.
 *
 * Flow:
 * 1. Archive page in Notion
 * 2. Delete from SQLite
 */
export async function deleteEntity(id: string): Promise<void> {
  const db = getDb();

  // Verify it exists first
  getEntity(id);

  // 1. Archive in Notion
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: id,
    archived: true,
  });

  // 2. Delete from SQLite
  const result = db.prepare("DELETE FROM entities WHERE id = ?").run(id);
  if (result.changes === 0) throw new NotFoundError("Entity", id);
}
