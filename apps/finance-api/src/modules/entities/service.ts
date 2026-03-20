/**
 * Entity service — CRUD operations against SQLite.
 * SQLite is the source of truth. All operations are local.
 * All SQL uses parameterized queries (no string interpolation).
 */
import crypto from "crypto";
import { getDb } from "../../db.js";
import { NotFoundError, ConflictError } from "../../shared/errors.js";
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
 * Generates a local UUID and inserts directly into SQLite.
 */
export function createEntity(input: CreateEntityInput): EntityRow {
  const db = getDb();

  const existing = db.prepare("SELECT id FROM entities WHERE name = ?").get(input.name) as
    | { id: string }
    | undefined;
  if (existing) {
    throw new ConflictError(`Entity with name '${input.name}' already exists`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO entities (id, name, type, abn, aliases, default_transaction_type, default_tags, notes, last_edited_time)
    VALUES (@id, @name, @type, @abn, @aliases, @defaultTransactionType, @defaultTags, @notes, @lastEditedTime)
  `
  ).run({
    id,
    name: input.name,
    type: input.type ?? "company",
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
 * Updates directly in SQLite.
 */
export function updateEntity(id: string, input: UpdateEntityInput): EntityRow {
  const db = getDb();

  // Verify it exists first
  getEntity(id);

  const fields: string[] = [];
  const params: Record<string, string | number | null> = { id };

  if (input.name !== undefined) {
    fields.push("name = @name");
    params["name"] = input.name;
  }
  if (input.type !== undefined) {
    fields.push("type = @type");
    params["type"] = input.type;
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
 * Deletes directly from SQLite.
 */
export function deleteEntity(id: string): void {
  const db = getDb();

  // Verify it exists first
  getEntity(id);

  const result = db.prepare("DELETE FROM entities WHERE id = ?").run(id);
  if (result.changes === 0) throw new NotFoundError("Entity", id);
}
