import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCaller,
  seedFixture,
  seedInventoryItem,
  seedItemFixtureConnection,
  seedLocation,
  setupTestContext,
} from '../../../shared/test-utils.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('inventory.fixtures.list', () => {
  it('returns empty list when no fixtures exist', async () => {
    const result = await caller.inventory.fixtures.list({});
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns all fixtures', async () => {
    seedFixture(db, { name: 'Outlet A', type: 'power_outlet' });
    seedFixture(db, { name: 'Ethernet 1', type: 'ethernet' });

    const result = await caller.inventory.fixtures.list({});
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('filters by locationId', async () => {
    const locId = seedLocation(db, { name: 'Living Room' });
    seedFixture(db, { name: 'Outlet A', type: 'power_outlet', location_id: locId });
    seedFixture(db, { name: 'Outlet B', type: 'power_outlet', location_id: null });

    const result = await caller.inventory.fixtures.list({ locationId: locId });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe('Outlet A');
  });

  it('filters by type', async () => {
    seedFixture(db, { name: 'Outlet A', type: 'power_outlet' });
    seedFixture(db, { name: 'Port 1', type: 'ethernet' });

    const result = await caller.inventory.fixtures.list({ type: 'ethernet' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe('Port 1');
  });

  it('paginates results', async () => {
    for (let i = 0; i < 3; i++) {
      seedFixture(db, { name: `Fixture ${i}`, type: 'power_outlet' });
    }

    const page1 = await caller.inventory.fixtures.list({ limit: 2, offset: 0 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = await caller.inventory.fixtures.list({ limit: 2, offset: 2 });
    expect(page2.data).toHaveLength(1);
  });
});

describe('inventory.fixtures.get', () => {
  it('returns a fixture by id', async () => {
    const id = seedFixture(db, {
      name: 'Power Outlet A',
      type: 'power_outlet',
      notes: 'Left wall',
    });

    const result = await caller.inventory.fixtures.get({ id });
    expect(result.data).toMatchObject({
      id,
      name: 'Power Outlet A',
      type: 'power_outlet',
      notes: 'Left wall',
    });
  });

  it('throws NOT_FOUND for nonexistent id', async () => {
    await expect(caller.inventory.fixtures.get({ id: 'nonexistent' })).rejects.toThrow(TRPCError);
    try {
      await caller.inventory.fixtures.get({ id: 'nonexistent' });
    } catch (err) {
      expect((err as TRPCError).code).toBe('NOT_FOUND');
    }
  });
});

describe('inventory.fixtures.create', () => {
  it('creates a fixture with required fields', async () => {
    const result = await caller.inventory.fixtures.create({
      name: 'Outlet A',
      type: 'power_outlet',
    });
    expect(result.message).toBe('Fixture created');
    expect(result.data.id).toBeTypeOf('string');
    expect(result.data.name).toBe('Outlet A');
    expect(result.data.type).toBe('power_outlet');
    expect(result.data.locationId).toBeNull();
    expect(result.data.notes).toBeNull();
  });

  it('creates a fixture with all fields', async () => {
    const locId = seedLocation(db, { name: 'Office' });
    const result = await caller.inventory.fixtures.create({
      name: 'Ethernet Port 1',
      type: 'ethernet',
      locationId: locId,
      notes: 'Behind desk',
    });
    expect(result.data.locationId).toBe(locId);
    expect(result.data.notes).toBe('Behind desk');
  });

  it('persists to the database', async () => {
    await caller.inventory.fixtures.create({ name: 'Outlet A', type: 'power_outlet' });
    const row = db.prepare('SELECT * FROM fixtures WHERE name = ?').get('Outlet A') as
      | { name: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('Outlet A');
  });
});

describe('inventory.fixtures.update', () => {
  it('updates fixture name', async () => {
    const id = seedFixture(db, { name: 'Old Name', type: 'power_outlet' });
    const result = await caller.inventory.fixtures.update({ id, data: { name: 'New Name' } });
    expect(result.data.name).toBe('New Name');
    expect(result.message).toBe('Fixture updated');
  });

  it('clears nullable field with null', async () => {
    const id = seedFixture(db, { name: 'Outlet', type: 'power_outlet', notes: 'Some notes' });
    const result = await caller.inventory.fixtures.update({ id, data: { notes: null } });
    expect(result.data.notes).toBeNull();
  });

  it('sets locationId to a value', async () => {
    const id = seedFixture(db, { name: 'Outlet', type: 'power_outlet' });
    const locId = seedLocation(db, { name: 'Living Room' });
    const result = await caller.inventory.fixtures.update({ id, data: { locationId: locId } });
    expect(result.data.locationId).toBe(locId);
  });

  it('clears locationId with null', async () => {
    const locId = seedLocation(db, { name: 'Room' });
    const id = seedFixture(db, { name: 'Outlet', type: 'power_outlet', location_id: locId });
    const result = await caller.inventory.fixtures.update({ id, data: { locationId: null } });
    expect(result.data.locationId).toBeNull();
  });

  it('throws NOT_FOUND for nonexistent id', async () => {
    await expect(
      caller.inventory.fixtures.update({ id: 'nope', data: { name: 'X' } })
    ).rejects.toThrow(TRPCError);
    try {
      await caller.inventory.fixtures.update({ id: 'nope', data: { name: 'X' } });
    } catch (err) {
      expect((err as TRPCError).code).toBe('NOT_FOUND');
    }
  });
});

describe('inventory.fixtures.delete', () => {
  it('deletes a fixture', async () => {
    const id = seedFixture(db, { name: 'Outlet', type: 'power_outlet' });
    const result = await caller.inventory.fixtures.delete({ id });
    expect(result.message).toBe('Fixture deleted');
    const row = db.prepare('SELECT id FROM fixtures WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('cascades to item_fixture_connections', async () => {
    const fixtureId = seedFixture(db, { name: 'Outlet', type: 'power_outlet' });
    const itemId = seedInventoryItem(db, { item_name: 'Laptop' });
    seedItemFixtureConnection(db, itemId, fixtureId);

    await caller.inventory.fixtures.delete({ id: fixtureId });

    const conn = db
      .prepare('SELECT id FROM item_fixture_connections WHERE fixture_id = ?')
      .get(fixtureId);
    expect(conn).toBeUndefined();
  });

  it('throws NOT_FOUND for nonexistent id', async () => {
    await expect(caller.inventory.fixtures.delete({ id: 'nope' })).rejects.toThrow(TRPCError);
    try {
      await caller.inventory.fixtures.delete({ id: 'nope' });
    } catch (err) {
      expect((err as TRPCError).code).toBe('NOT_FOUND');
    }
  });
});

describe('inventory.fixtures.connect', () => {
  it('connects an item to a fixture', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Laptop' });
    const fixtureId = seedFixture(db, { name: 'Power Outlet A', type: 'power_outlet' });

    const result = await caller.inventory.fixtures.connect({ itemId, fixtureId });
    expect(result.message).toBe('Item connected to fixture');
    expect(result.data.itemId).toBe(itemId);
    expect(result.data.fixtureId).toBe(fixtureId);
    expect(result.data.id).toBeTypeOf('number');
  });

  it('allows one item to connect to multiple fixtures', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'PC' });
    const fix1 = seedFixture(db, { name: 'Outlet A', type: 'power_outlet' });
    const fix2 = seedFixture(db, { name: 'Port 1', type: 'ethernet' });

    await caller.inventory.fixtures.connect({ itemId, fixtureId: fix1 });
    await caller.inventory.fixtures.connect({ itemId, fixtureId: fix2 });

    const result = await caller.inventory.fixtures.listForItem({ itemId });
    expect(result.data).toHaveLength(2);
  });

  it('allows multiple items on the same fixture', async () => {
    const item1 = seedInventoryItem(db, { item_name: 'TV' });
    const item2 = seedInventoryItem(db, { item_name: 'Speakers' });
    const fixtureId = seedFixture(db, { name: 'Outlet A', type: 'power_outlet' });

    await caller.inventory.fixtures.connect({ itemId: item1, fixtureId });
    await caller.inventory.fixtures.connect({ itemId: item2, fixtureId });
    // No error — a power strip can serve multiple items
  });

  it('throws CONFLICT when same item-fixture pair connected twice', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Laptop' });
    const fixtureId = seedFixture(db, { name: 'Outlet', type: 'power_outlet' });

    await caller.inventory.fixtures.connect({ itemId, fixtureId });
    await expect(caller.inventory.fixtures.connect({ itemId, fixtureId })).rejects.toThrow(
      TRPCError
    );
    try {
      await caller.inventory.fixtures.connect({ itemId, fixtureId });
    } catch (err) {
      expect((err as TRPCError).code).toBe('CONFLICT');
    }
  });

  it('throws NOT_FOUND when item does not exist', async () => {
    const fixtureId = seedFixture(db, { name: 'Outlet', type: 'power_outlet' });
    await expect(caller.inventory.fixtures.connect({ itemId: 'nope', fixtureId })).rejects.toThrow(
      TRPCError
    );
    try {
      await caller.inventory.fixtures.connect({ itemId: 'nope', fixtureId });
    } catch (err) {
      expect((err as TRPCError).code).toBe('NOT_FOUND');
    }
  });

  it('throws NOT_FOUND when fixture does not exist', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Laptop' });
    await expect(caller.inventory.fixtures.connect({ itemId, fixtureId: 'nope' })).rejects.toThrow(
      TRPCError
    );
    try {
      await caller.inventory.fixtures.connect({ itemId, fixtureId: 'nope' });
    } catch (err) {
      expect((err as TRPCError).code).toBe('NOT_FOUND');
    }
  });
});

describe('inventory.fixtures.disconnect', () => {
  it('disconnects an item from a fixture', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Laptop' });
    const fixtureId = seedFixture(db, { name: 'Outlet', type: 'power_outlet' });
    seedItemFixtureConnection(db, itemId, fixtureId);

    const result = await caller.inventory.fixtures.disconnect({ itemId, fixtureId });
    expect(result.message).toBe('Item disconnected from fixture');

    const conn = db
      .prepare('SELECT id FROM item_fixture_connections WHERE item_id = ? AND fixture_id = ?')
      .get(itemId, fixtureId);
    expect(conn).toBeUndefined();
  });

  it('does not affect other connections', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'PC' });
    const fix1 = seedFixture(db, { name: 'Outlet A', type: 'power_outlet' });
    const fix2 = seedFixture(db, { name: 'Outlet B', type: 'power_outlet' });
    seedItemFixtureConnection(db, itemId, fix1);
    seedItemFixtureConnection(db, itemId, fix2);

    await caller.inventory.fixtures.disconnect({ itemId, fixtureId: fix1 });

    const surviving = db
      .prepare('SELECT id FROM item_fixture_connections WHERE item_id = ? AND fixture_id = ?')
      .get(itemId, fix2);
    expect(surviving).toBeDefined();
  });

  it('throws NOT_FOUND when connection does not exist', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Laptop' });
    const fixtureId = seedFixture(db, { name: 'Outlet', type: 'power_outlet' });

    await expect(caller.inventory.fixtures.disconnect({ itemId, fixtureId })).rejects.toThrow(
      TRPCError
    );
    try {
      await caller.inventory.fixtures.disconnect({ itemId, fixtureId });
    } catch (err) {
      expect((err as TRPCError).code).toBe('NOT_FOUND');
    }
  });
});

describe('inventory.fixtures.listForItem', () => {
  it('returns empty list when item has no fixture connections', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'Unplugged Item' });
    const result = await caller.inventory.fixtures.listForItem({ itemId });
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('returns all fixture connections for an item', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'PC' });
    const fix1 = seedFixture(db, { name: 'Outlet A', type: 'power_outlet' });
    const fix2 = seedFixture(db, { name: 'Port 1', type: 'ethernet' });
    seedItemFixtureConnection(db, itemId, fix1);
    seedItemFixtureConnection(db, itemId, fix2);

    const result = await caller.inventory.fixtures.listForItem({ itemId });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it('does not return connections belonging to other items', async () => {
    const item1 = seedInventoryItem(db, { item_name: 'PC' });
    const item2 = seedInventoryItem(db, { item_name: 'TV' });
    const fix1 = seedFixture(db, { name: 'Outlet A', type: 'power_outlet' });
    const fix2 = seedFixture(db, { name: 'Outlet B', type: 'power_outlet' });
    seedItemFixtureConnection(db, item1, fix1);
    seedItemFixtureConnection(db, item2, fix2);

    const result = await caller.inventory.fixtures.listForItem({ itemId: item1 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.fixtureId).toBe(fix1);
  });

  it('paginates results', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'PC' });
    for (let i = 0; i < 3; i++) {
      const fid = seedFixture(db, { name: `Fixture ${i}`, type: 'power_outlet' });
      seedItemFixtureConnection(db, itemId, fid);
    }

    const page1 = await caller.inventory.fixtures.listForItem({ itemId, limit: 2, offset: 0 });
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.hasMore).toBe(true);

    const page2 = await caller.inventory.fixtures.listForItem({ itemId, limit: 2, offset: 2 });
    expect(page2.data).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
  });
});

describe('inventory.fixtures auth', () => {
  it('throws UNAUTHORIZED without auth on list', async () => {
    const unauth = createCaller(false);
    await expect(unauth.inventory.fixtures.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('throws UNAUTHORIZED without auth on create', async () => {
    const unauth = createCaller(false);
    await expect(
      unauth.inventory.fixtures.create({ name: 'Outlet', type: 'power_outlet' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED without auth on connect', async () => {
    const unauth = createCaller(false);
    await expect(
      unauth.inventory.fixtures.connect({ itemId: 'a', fixtureId: 'b' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
