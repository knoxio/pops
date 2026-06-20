/**
 * Integration tests for the `items.*` REST surface in pops-inventory-api.
 *
 * Boots the Express app via the production `createInventoryApiApp`
 * factory against a per-test temp inventory.db and drives every endpoint
 * through supertest (see `makeClient`). The pillar trusts the docker net
 * — there is no auth layer to exercise. Service `NotFoundError`s surface
 * as HTTP 404.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { HttpError, makeClient } from './test-utils.js';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-items-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('items REST — CRUD happy paths', () => {
  it('creates, lists, gets, updates and deletes an item', async () => {
    const api = client();

    const created = await api.items.create({
      itemName: 'MacBook Pro',
      brand: 'Apple',
      replacementValue: 2500,
      purchasePrice: 1999,
    });
    expect(created.data.itemName).toBe('MacBook Pro');
    expect(created.data.brand).toBe('Apple');
    expect(created.data.replacementValue).toBe(2500);
    expect(created.data.purchasePrice).toBe(1999);
    expect(created.data.inUse).toBe(false);
    expect(created.data.deductible).toBe(false);

    const list = await api.items.list();
    expect(list.data).toHaveLength(1);
    expect(list.pagination.total).toBe(1);
    expect(list.pagination.hasMore).toBe(false);
    expect(list.totals.totalReplacementValue).toBe(2500);

    const fetched = await api.items.get(created.data.id);
    expect(fetched.data.itemName).toBe('MacBook Pro');

    const updated = await api.items.update(created.data.id, {
      itemName: 'MacBook Pro 16"',
      inUse: true,
    });
    expect(updated.data.itemName).toBe('MacBook Pro 16"');
    expect(updated.data.inUse).toBe(true);

    const ack = await api.items.delete(created.data.id);
    expect(ack).toEqual({ message: 'Inventory item deleted' });

    const after = await api.items.list();
    expect(after.pagination.total).toBe(0);
  });

  it('preserves null fields on create when omitted', async () => {
    const created = await client().items.create({ itemName: 'Desk' });
    expect(created.data.brand).toBeNull();
    expect(created.data.model).toBeNull();
    expect(created.data.locationId).toBeNull();
    expect(created.data.replacementValue).toBeNull();
  });

  it('clears a nullable field when explicit null is supplied', async () => {
    const api = client();
    const created = await api.items.create({ itemName: 'Chair', brand: 'Herman Miller' });
    const cleared = await api.items.update(created.data.id, { brand: null });
    expect(cleared.data.brand).toBeNull();
  });

  it('leaves untouched fields unchanged on partial update', async () => {
    const api = client();
    const created = await api.items.create({
      itemName: 'Bike',
      brand: 'Specialized',
      resaleValue: 1000,
    });
    const updated = await api.items.update(created.data.id, {
      resaleValue: 1200,
      purchasePrice: 800,
    });
    expect(updated.data.brand).toBe('Specialized');
    expect(updated.data.resaleValue).toBe(1200);
    expect(updated.data.purchasePrice).toBe(800);
  });

  it('sums replacement and resale totals across the filtered set', async () => {
    const api = client();
    await api.items.create({ itemName: 'A', replacementValue: 100, resaleValue: 60 });
    await api.items.create({ itemName: 'B', replacementValue: 250, resaleValue: 120 });

    const list = await api.items.list();
    expect(list.totals.totalReplacementValue).toBe(350);
    expect(list.totals.totalResaleValue).toBe(180);
  });
});

describe('items REST — filters + projections', () => {
  it('searchByAssetId returns the row when found (case-insensitive)', async () => {
    const api = client();
    await api.items.create({ itemName: 'Laptop', assetId: 'POPS-001' });
    const hit = await api.items.searchByAssetId('pops-001');
    expect(hit.data?.itemName).toBe('Laptop');
  });

  it('searchByAssetId returns null when not found', async () => {
    const miss = await client().items.searchByAssetId('NOPE');
    expect(miss.data).toBeNull();
  });

  it('countByAssetPrefix counts matching items by prefix', async () => {
    const api = client();
    await api.items.create({ itemName: 'A', assetId: 'POPS-001' });
    await api.items.create({ itemName: 'B', assetId: 'POPS-002' });
    await api.items.create({ itemName: 'C', assetId: 'OTHER-001' });

    const count = await api.items.countByAssetPrefix('pops-');
    expect(count.data).toBe(2);
  });

  it('distinctTypes returns the unique non-null set sorted', async () => {
    const api = client();
    await api.items.create({ itemName: 'A', type: 'tool' });
    await api.items.create({ itemName: 'B', type: 'appliance' });
    await api.items.create({ itemName: 'C', type: 'tool' });
    await api.items.create({ itemName: 'D' });

    const types = await api.items.distinctTypes();
    expect(types.data).toEqual(['appliance', 'tool']);
  });

  it('filters list by search (LIKE on itemName)', async () => {
    const api = client();
    await api.items.create({ itemName: 'MacBook Pro' });
    await api.items.create({ itemName: 'iPad' });

    const list = await api.items.list({ search: 'Mac' });
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.itemName).toBe('MacBook Pro');
  });

  it('filters by tri-bool inUse', async () => {
    const api = client();
    await api.items.create({ itemName: 'A', inUse: true });
    await api.items.create({ itemName: 'B', inUse: false });

    const inUseOnly = await api.items.list({ inUse: 'true' });
    expect(inUseOnly.data).toHaveLength(1);
    expect(inUseOnly.data[0]?.itemName).toBe('A');
  });
});

describe('items REST — error mapping', () => {
  it('returns 404 when getting an unknown item', async () => {
    await expect(client().items.get('missing')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns 404 when updating an unknown item', async () => {
    await expect(client().items.update('missing', { itemName: 'X' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns 404 when deleting an unknown item', async () => {
    await expect(client().items.delete('missing')).rejects.toBeInstanceOf(HttpError);
  });

  it('rejects an empty itemName at the zod boundary with 400', async () => {
    await expect(client().items.create({ itemName: '' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('items REST — raw HTTP wire smoke', () => {
  it('GET /items answers 200 with the list envelope', async () => {
    const app = createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    });
    await request(app).post('/items').send({ itemName: 'Wire smoke item' });

    const res = await request(app).get('/items');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].itemName).toBe('Wire smoke item');
  });
});
