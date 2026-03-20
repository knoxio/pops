/**
 * Entity service — CRUD operations using Drizzle ORM.
 * SQLite is the source of truth. All operations are local.
 */
import crypto from "crypto";
import { eq, like, count, and } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { entities } from "../../../db/schema/entities.js";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";
import type { EntityRow, CreateEntityInput, UpdateEntityInput } from "./types.js";

/** Map a Drizzle result row to the snake_case EntityRow interface. */
function toRow(row: typeof entities.$inferSelect): EntityRow {
  return {
    id: row.id,
    notion_id: row.notionId,
    name: row.name,
    type: row.type,
    abn: row.abn,
    aliases: row.aliases,
    default_transaction_type: row.defaultTransactionType,
    default_tags: row.defaultTags,
    notes: row.notes,
    last_edited_time: row.lastEditedTime,
  };
}

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
  const db = getDrizzle();

  let query = db.select().from(entities).$dynamic();
  let countQuery = db.select({ total: count() }).from(entities).$dynamic();

  const conditions = [];
  if (search) {
    conditions.push(like(entities.name, `%${search}%`));
  }
  if (type) {
    conditions.push(eq(entities.type, type));
  }

  if (conditions.length > 0) {
    const where = and(...conditions);
    query = query.where(where);
    countQuery = countQuery.where(where);
  }

  const rows = query
    .orderBy(entities.name)
    .limit(limit)
    .offset(offset)
    .all();

  const [countResult] = countQuery.all();

  return { rows: rows.map(toRow), total: countResult.total };
}

/** Get a single entity by id. Throws NotFoundError if missing. */
export function getEntity(id: string): EntityRow {
  const db = getDrizzle();
  const [row] = db.select().from(entities).where(eq(entities.id, id)).all();

  if (!row) throw new NotFoundError("Entity", id);
  return toRow(row);
}

/**
 * Create a new entity. Returns the created row.
 * Generates a local UUID and inserts directly into SQLite.
 */
export function createEntity(input: CreateEntityInput): EntityRow {
  const db = getDrizzle();

  const [existing] = db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.name, input.name))
    .all();

  if (existing) {
    throw new ConflictError(`Entity with name '${input.name}' already exists`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(entities)
    .values({
      id,
      name: input.name,
      type: input.type ?? "company",
      abn: input.abn ?? null,
      aliases: input.aliases?.length ? input.aliases.join(", ") : null,
      defaultTransactionType: input.defaultTransactionType ?? null,
      defaultTags: input.defaultTags?.length ? JSON.stringify(input.defaultTags) : null,
      notes: input.notes ?? null,
      lastEditedTime: now,
    })
    .run();

  return getEntity(id);
}

/**
 * Update an existing entity. Returns the updated row.
 * Updates directly in SQLite.
 */
export function updateEntity(id: string, input: UpdateEntityInput): EntityRow {
  const db = getDrizzle();

  // Verify it exists first
  getEntity(id);

  const updates: Partial<typeof entities.$inferInsert> = {};
  let hasUpdates = false;

  if (input.name !== undefined) {
    updates.name = input.name;
    hasUpdates = true;
  }
  if (input.type !== undefined) {
    updates.type = input.type;
    hasUpdates = true;
  }
  if (input.abn !== undefined) {
    updates.abn = input.abn ?? null;
    hasUpdates = true;
  }
  if (input.aliases !== undefined) {
    updates.aliases = input.aliases.length ? input.aliases.join(", ") : null;
    hasUpdates = true;
  }
  if (input.defaultTransactionType !== undefined) {
    updates.defaultTransactionType = input.defaultTransactionType ?? null;
    hasUpdates = true;
  }
  if (input.defaultTags !== undefined) {
    updates.defaultTags = input.defaultTags.length ? JSON.stringify(input.defaultTags) : null;
    hasUpdates = true;
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes ?? null;
    hasUpdates = true;
  }

  if (hasUpdates) {
    updates.lastEditedTime = new Date().toISOString();
    db.update(entities).set(updates).where(eq(entities.id, id)).run();
  }

  return getEntity(id);
}

/**
 * Delete an entity by ID. Throws NotFoundError if missing.
 * Deletes directly from SQLite.
 */
export function deleteEntity(id: string): void {
  // Verify it exists first
  getEntity(id);

  const db = getDrizzle();
  const result = db.delete(entities).where(eq(entities.id, id)).run();
  if (result.changes === 0) throw new NotFoundError("Entity", id);
}
