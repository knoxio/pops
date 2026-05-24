import { and, asc, count, eq, sql } from 'drizzle-orm';

import { fixtures, homeInventory, itemFixtureConnections } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';

import type {
  CreateFixtureInput,
  FixtureRow,
  ItemFixtureConnectionRow,
  UpdateFixtureInput,
} from './types.js';

const NOW = (): string => new Date().toISOString();

export interface FixtureListResult {
  rows: FixtureRow[];
  total: number;
}

export interface FixtureConnectionListResult {
  rows: ItemFixtureConnectionRow[];
  total: number;
}

export function listFixtures(opts: {
  locationId?: string;
  type?: string;
  limit: number;
  offset: number;
}): FixtureListResult {
  const db = getDrizzle();
  const conditions = [];
  if (opts.locationId) conditions.push(eq(fixtures.locationId, opts.locationId));
  if (opts.type) conditions.push(eq(fixtures.type, opts.type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(fixtures)
    .where(where)
    .orderBy(asc(fixtures.createdAt), asc(fixtures.id))
    .limit(opts.limit)
    .offset(opts.offset)
    .all();
  const [countResult] = db.select({ total: count() }).from(fixtures).where(where).all();
  return { rows, total: countResult?.total ?? 0 };
}

export function getFixture(id: string): FixtureRow {
  const db = getDrizzle();
  const [row] = db.select().from(fixtures).where(eq(fixtures.id, id)).all();
  if (!row) throw new NotFoundError('Fixture', id);
  return row;
}

export function createFixture(input: CreateFixtureInput): FixtureRow {
  const db = getDrizzle();
  const now = NOW();
  db.insert(fixtures)
    .values({
      name: input.name,
      type: input.type,
      locationId: input.locationId ?? null,
      notes: input.notes ?? null,
      lastEditedTime: now,
    })
    .run();

  const [row] = db
    .select()
    .from(fixtures)
    .where(sql`rowid = last_insert_rowid()`)
    .all();
  if (!row) throw new Error('Failed to retrieve created fixture');
  return row;
}

export function updateFixture(id: string, input: UpdateFixtureInput): FixtureRow {
  const db = getDrizzle();
  const existing = getFixture(id);

  const patch: Record<string, unknown> = { lastEditedTime: NOW() };
  if ('name' in input && input.name !== undefined) patch['name'] = input.name;
  if ('type' in input && input.type !== undefined) patch['type'] = input.type;
  if ('locationId' in input && input.locationId !== undefined)
    patch['locationId'] = input.locationId;
  if ('notes' in input && input.notes !== undefined) patch['notes'] = input.notes;

  db.update(fixtures).set(patch).where(eq(fixtures.id, existing.id)).run();

  return getFixture(id);
}

export function deleteFixture(id: string): void {
  const db = getDrizzle();
  const existing = getFixture(id);
  db.delete(fixtures).where(eq(fixtures.id, existing.id)).run();
}

export function connectItemToFixture(itemId: string, fixtureId: string): ItemFixtureConnectionRow {
  const db = getDrizzle();

  const [item] = db
    .select({ id: homeInventory.id })
    .from(homeInventory)
    .where(eq(homeInventory.id, itemId))
    .all();
  if (!item) throw new NotFoundError('Inventory item', itemId);

  const [fixture] = db
    .select({ id: fixtures.id })
    .from(fixtures)
    .where(eq(fixtures.id, fixtureId))
    .all();
  if (!fixture) throw new NotFoundError('Fixture', fixtureId);

  try {
    db.insert(itemFixtureConnections).values({ itemId, fixtureId }).run();
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new ConflictError(`Item '${itemId}' is already connected to fixture '${fixtureId}'`);
    }
    throw err;
  }

  const [created] = db
    .select()
    .from(itemFixtureConnections)
    .where(
      and(
        eq(itemFixtureConnections.itemId, itemId),
        eq(itemFixtureConnections.fixtureId, fixtureId)
      )
    )
    .all();
  if (!created) throw new Error('Failed to retrieve created fixture connection');
  return created;
}

export function disconnectItemFromFixture(itemId: string, fixtureId: string): void {
  const db = getDrizzle();
  const [row] = db
    .select({ id: itemFixtureConnections.id })
    .from(itemFixtureConnections)
    .where(
      and(
        eq(itemFixtureConnections.itemId, itemId),
        eq(itemFixtureConnections.fixtureId, fixtureId)
      )
    )
    .all();
  if (!row) throw new NotFoundError('Item-fixture connection', `${itemId}-${fixtureId}`);
  db.delete(itemFixtureConnections).where(eq(itemFixtureConnections.id, row.id)).run();
}

export function listFixturesForItem(
  itemId: string,
  limit: number,
  offset: number
): FixtureConnectionListResult {
  const db = getDrizzle();
  const condition = eq(itemFixtureConnections.itemId, itemId);
  const rows = db
    .select()
    .from(itemFixtureConnections)
    .where(condition)
    .orderBy(asc(itemFixtureConnections.createdAt), asc(itemFixtureConnections.id))
    .limit(limit)
    .offset(offset)
    .all();
  const [countResult] = db
    .select({ total: count() })
    .from(itemFixtureConnections)
    .where(condition)
    .all();
  return { rows, total: countResult?.total ?? 0 };
}
