/**
 * Entity service — plain `entities`-table CRUD via drizzle against the
 * core pillar's SQLite handle.
 *
 * Relocated from `apps/pops-api/src/modules/core/entities/service.ts`. The
 * monolith version LEFT JOINed `@pops/finance-db`'s `transactions` table to
 * enrich each row with a `transactionCount` (and supported an `orphanedOnly`
 * filter). That join is finance-owned — the count is derived from a finance
 * table — so it is dropped here: the pillar's `entities` surface is the bare
 * entity rows. A consumer that needs a transaction count asks the finance
 * pillar.
 */
import crypto from 'node:crypto';

import { and, count, eq, like, ne, sql } from 'drizzle-orm';

import { type CoreDb, entities } from '../../../db/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';

import type { CreateEntityInput, EntityRow, UpdateEntityInput } from './types.js';

/** Count + rows for a paginated list. */
export interface EntityListResult {
  rows: EntityRow[];
  total: number;
}

export interface ListEntitiesOptions {
  search?: string;
  type?: string;
  limit: number;
  offset: number;
}

function buildEntityFilter(opts: ListEntitiesOptions): ReturnType<typeof and> | undefined {
  const conditions = [];
  if (opts.search) conditions.push(like(entities.name, `%${opts.search}%`));
  if (opts.type) conditions.push(eq(entities.type, opts.type));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** List entities with optional search and type filters, sorted case-insensitively by name. */
export function listEntities(db: CoreDb, opts: ListEntitiesOptions): EntityListResult {
  const whereClause = buildEntityFilter(opts);

  const rows = db
    .select()
    .from(entities)
    .where(whereClause)
    .orderBy(sql`${entities.name} COLLATE NOCASE`)
    .limit(opts.limit)
    .offset(opts.offset)
    .all();

  let countQuery = db.select({ total: count() }).from(entities).$dynamic();
  if (whereClause) countQuery = countQuery.where(whereClause);
  const [countResult] = countQuery.all();

  return { rows, total: countResult?.total ?? 0 };
}

/** Get a single entity by id. Throws NotFoundError if missing. */
export function getEntity(db: CoreDb, id: string): EntityRow {
  const [row] = db.select().from(entities).where(eq(entities.id, id)).all();
  if (!row) throw new NotFoundError('Entity', id);
  return row;
}

/**
 * Create a new entity. Returns the created row. Generates a local UUID and
 * inserts directly into SQLite.
 */
export function createEntity(db: CoreDb, input: CreateEntityInput): EntityRow {
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
      type: input.type ?? 'company',
      abn: input.abn ?? null,
      aliases: input.aliases?.length ? input.aliases.join(', ') : null,
      defaultTransactionType: input.defaultTransactionType ?? null,
      defaultTags: input.defaultTags?.length ? JSON.stringify(input.defaultTags) : null,
      notes: input.notes ?? null,
      lastEditedTime: now,
    })
    .run();

  return getEntity(db, id);
}

function assertNoDuplicateName(db: CoreDb, id: string, name: string | undefined): void {
  if (name === undefined) return;
  const [existing] = db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.name, name), ne(entities.id, id)))
    .all();
  if (existing) throw new ConflictError(`Entity with name '${name}' already exists`);
}

function buildScalarUpdates(
  input: UpdateEntityInput,
  updates: Partial<typeof entities.$inferInsert>
): void {
  if (input.name !== undefined) updates.name = input.name;
  if (input.type !== undefined) updates.type = input.type;
  if (input.abn !== undefined) updates.abn = input.abn ?? null;
  if (input.notes !== undefined) updates.notes = input.notes ?? null;
  if (input.defaultTransactionType !== undefined) {
    updates.defaultTransactionType = input.defaultTransactionType ?? null;
  }
}

function buildArrayUpdates(
  input: UpdateEntityInput,
  updates: Partial<typeof entities.$inferInsert>
): void {
  if (input.aliases !== undefined) {
    updates.aliases = input.aliases.length > 0 ? input.aliases.join(', ') : null;
  }
  if (input.defaultTags !== undefined) {
    updates.defaultTags = input.defaultTags.length > 0 ? JSON.stringify(input.defaultTags) : null;
  }
}

function buildEntityUpdates(input: UpdateEntityInput): Partial<typeof entities.$inferInsert> {
  const updates: Partial<typeof entities.$inferInsert> = {};
  buildScalarUpdates(input, updates);
  buildArrayUpdates(input, updates);
  return updates;
}

/** Update an existing entity. Returns the updated row. */
export function updateEntity(db: CoreDb, id: string, input: UpdateEntityInput): EntityRow {
  getEntity(db, id);
  assertNoDuplicateName(db, id, input.name);

  const updates = buildEntityUpdates(input);
  if (Object.keys(updates).length > 0) {
    updates.lastEditedTime = new Date().toISOString();
    db.update(entities).set(updates).where(eq(entities.id, id)).run();
  }

  return getEntity(db, id);
}

/** Delete an entity by ID. Throws NotFoundError if missing. */
export function deleteEntity(db: CoreDb, id: string): void {
  getEntity(db, id);
  const result = db.delete(entities).where(eq(entities.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Entity', id);
}
