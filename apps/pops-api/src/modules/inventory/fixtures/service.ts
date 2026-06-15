import { and, asc, count, eq } from 'drizzle-orm';

import { fixtures, homeInventory, itemFixtureConnections } from '@pops/inventory-db';

import { getInventoryDrizzle } from '../../../db/inventory-handle.js';
import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import {
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from '../../../shared/sqlite-errors.js';

import type {
  CreateFixtureInput,
  Fixture,
  ItemFixtureConnection,
  UpdateFixtureInput,
} from './types.js';

const NOW = (): string => new Date().toISOString();

export interface FixtureListResult {
  rows: Fixture[];
  total: number;
}

export interface FixtureConnectionListResult {
  rows: ItemFixtureConnection[];
  total: number;
}

export function listFixtures(opts: {
  locationId?: string;
  type?: string;
  limit: number;
  offset: number;
}): FixtureListResult {
  const db = getInventoryDrizzle();
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

export function getFixture(id: string): Fixture {
  const db = getInventoryDrizzle();
  const [row] = db.select().from(fixtures).where(eq(fixtures.id, id)).all();
  if (!row) throw new NotFoundError('Fixture', id);
  return row;
}

export function createFixture(input: CreateFixtureInput): Fixture {
  const db = getInventoryDrizzle();
  const [row] = db
    .insert(fixtures)
    .values({
      name: input.name,
      type: input.type,
      locationId: input.locationId ?? null,
      notes: input.notes ?? null,
      lastEditedTime: NOW(),
    })
    .returning()
    .all();
  if (!row) throw new Error('Failed to create fixture');
  return row;
}

export function updateFixture(id: string, input: UpdateFixtureInput): Fixture {
  const db = getInventoryDrizzle();

  // Three-state per field: absent → leave, null → clear, value → set.
  // `UpdateFixtureSchema.refine` guarantees at least one input key, so the
  // patch is never empty (`lastEditedTime` aside).
  const patch: Record<string, unknown> = { lastEditedTime: NOW() };
  if ('name' in input && input.name !== undefined) patch['name'] = input.name;
  if ('type' in input && input.type !== undefined) patch['type'] = input.type;
  if ('locationId' in input && input.locationId !== undefined)
    patch['locationId'] = input.locationId;
  if ('notes' in input && input.notes !== undefined) patch['notes'] = input.notes;

  const [row] = db.update(fixtures).set(patch).where(eq(fixtures.id, id)).returning().all();
  if (!row) throw new NotFoundError('Fixture', id);
  return row;
}

export function deleteFixture(id: string): void {
  const db = getInventoryDrizzle();
  const result = db.delete(fixtures).where(eq(fixtures.id, id)).run();
  if (result.changes === 0) throw new NotFoundError('Fixture', id);
}

// Optimistic insert: the foreign keys on item_fixture_connections enforce
// existence, so a pre-check would only widen the TOCTOU window without buying
// correctness. We catch the constraint failures and reach for nicer error
// messages only on the unhappy path.
export function connectItemToFixture(itemId: string, fixtureId: string): ItemFixtureConnection {
  const db = getInventoryDrizzle();
  try {
    const [row] = db.insert(itemFixtureConnections).values({ itemId, fixtureId }).returning().all();
    if (!row) throw new Error('Failed to create item-fixture connection');
    return row;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError(`Item '${itemId}' is already connected to fixture '${fixtureId}'`);
    }
    if (isForeignKeyConstraintError(err)) {
      const [item] = db
        .select({ id: homeInventory.id })
        .from(homeInventory)
        .where(eq(homeInventory.id, itemId))
        .all();
      if (!item) throw new NotFoundError('Inventory item', itemId);
      throw new NotFoundError('Fixture', fixtureId);
    }
    throw err;
  }
}

export function disconnectItemFromFixture(itemId: string, fixtureId: string): void {
  const db = getInventoryDrizzle();
  const result = db
    .delete(itemFixtureConnections)
    .where(
      and(
        eq(itemFixtureConnections.itemId, itemId),
        eq(itemFixtureConnections.fixtureId, fixtureId)
      )
    )
    .run();
  if (result.changes === 0) {
    throw new NotFoundError('Item-fixture connection', `${itemId}-${fixtureId}`);
  }
}

export function listFixturesForItem(
  itemId: string,
  limit: number,
  offset: number
): FixtureConnectionListResult {
  const db = getInventoryDrizzle();
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
