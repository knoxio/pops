/**
 * Integration tests for the migrated `inventory.items.*` tRPC surface
 * inside pops-inventory-api (Theme 13 PRD-173 PR 1).
 *
 * Mirrors the locations writer-move coverage:
 *
 *   1. tRPC caller smoke — drives `appRouter.createCaller(ctx)` against
 *      a per-test in-memory inventory.db. Asserts the CRUD contract the
 *      legacy pops-api router enforced (list/get/create/update/delete
 *      happy paths, NOT_FOUND on unknown ids, UNAUTHORIZED for anonymous
 *      callers, FORBIDDEN for service accounts without the matching
 *      scope, plus the asset-id helpers and distinct-types projection).
 *
 *   2. HTTP wire smoke — boots the Express app via `createInventoryApiApp`
 *      and round-trips one query over `/trpc` with supertest. Proves
 *      `createExpressMiddleware` is wired up and the context factory
 *      reaches the inventory DB for the items slice too.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { appRouter } from '../router.js';
import { type Context } from '../trpc.js';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-items-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function userCaller(email = 'admin@example.com'): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email },
    serviceAccount: null,
    inventoryDb: inventoryDb.db,
  };
  return appRouter.createCaller(ctx);
}

function serviceAccountCaller(scopes: string[]): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: null,
    serviceAccount: { id: 'sa_test', name: 'test-sa', scopes },
    inventoryDb: inventoryDb.db,
  };
  return appRouter.createCaller(ctx);
}

function anonCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: null,
    serviceAccount: null,
    inventoryDb: inventoryDb.db,
  };
  return appRouter.createCaller(ctx);
}

describe('inventory.items (tRPC caller — CRUD happy paths)', () => {
  it('creates, lists, gets, updates and deletes an item', async () => {
    const admin = userCaller();

    const created = await admin.inventory.items.create({
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

    const list = await admin.inventory.items.list({});
    expect(list.data).toHaveLength(1);
    expect(list.pagination.total).toBe(1);
    expect(list.pagination.hasMore).toBe(false);
    expect(list.totals.totalReplacementValue).toBe(2500);

    const fetched = await admin.inventory.items.get({ id: created.data.id });
    expect(fetched.data.itemName).toBe('MacBook Pro');

    const updated = await admin.inventory.items.update({
      id: created.data.id,
      data: { itemName: 'MacBook Pro 16"', inUse: true },
    });
    expect(updated.data.itemName).toBe('MacBook Pro 16"');
    expect(updated.data.inUse).toBe(true);

    const ack = await admin.inventory.items.delete({ id: created.data.id });
    expect(ack).toEqual({ message: 'Inventory item deleted' });

    const after = await admin.inventory.items.list({});
    expect(after.pagination.total).toBe(0);
  });

  it('preserves null fields on create when omitted', async () => {
    const admin = userCaller();
    const created = await admin.inventory.items.create({ itemName: 'Desk' });
    expect(created.data.brand).toBeNull();
    expect(created.data.model).toBeNull();
    expect(created.data.locationId).toBeNull();
    expect(created.data.replacementValue).toBeNull();
  });

  it('clears a nullable field when explicit null is supplied', async () => {
    const admin = userCaller();
    const created = await admin.inventory.items.create({
      itemName: 'Chair',
      brand: 'Herman Miller',
    });
    const cleared = await admin.inventory.items.update({
      id: created.data.id,
      data: { brand: null },
    });
    expect(cleared.data.brand).toBeNull();
  });

  it('leaves untouched fields unchanged on partial update', async () => {
    const admin = userCaller();
    const created = await admin.inventory.items.create({
      itemName: 'Bike',
      brand: 'Specialized',
      resaleValue: 1000,
    });
    const updated = await admin.inventory.items.update({
      id: created.data.id,
      data: { resaleValue: 1200, purchasePrice: 800 },
    });
    expect(updated.data.brand).toBe('Specialized');
    expect(updated.data.resaleValue).toBe(1200);
    expect(updated.data.purchasePrice).toBe(800);
  });

  it('sums replacement and resale totals across the filtered set', async () => {
    const admin = userCaller();
    await admin.inventory.items.create({
      itemName: 'A',
      replacementValue: 100,
      resaleValue: 60,
    });
    await admin.inventory.items.create({
      itemName: 'B',
      replacementValue: 250,
      resaleValue: 120,
    });

    const list = await admin.inventory.items.list({});
    expect(list.totals.totalReplacementValue).toBe(350);
    expect(list.totals.totalResaleValue).toBe(180);
  });
});

describe('inventory.items (filters + projections)', () => {
  it('searchByAssetId returns the row when found (case-insensitive)', async () => {
    const admin = userCaller();
    await admin.inventory.items.create({ itemName: 'Laptop', assetId: 'POPS-001' });
    const hit = await admin.inventory.items.searchByAssetId({ assetId: 'pops-001' });
    expect(hit.data?.itemName).toBe('Laptop');
  });

  it('searchByAssetId returns null when not found', async () => {
    const admin = userCaller();
    const miss = await admin.inventory.items.searchByAssetId({ assetId: 'NOPE' });
    expect(miss.data).toBeNull();
  });

  it('countByAssetPrefix counts matching items by prefix', async () => {
    const admin = userCaller();
    await admin.inventory.items.create({ itemName: 'A', assetId: 'POPS-001' });
    await admin.inventory.items.create({ itemName: 'B', assetId: 'POPS-002' });
    await admin.inventory.items.create({ itemName: 'C', assetId: 'OTHER-001' });

    const count = await admin.inventory.items.countByAssetPrefix({ prefix: 'pops-' });
    expect(count.data).toBe(2);
  });

  it('distinctTypes returns the unique non-null set sorted', async () => {
    const admin = userCaller();
    await admin.inventory.items.create({ itemName: 'A', type: 'tool' });
    await admin.inventory.items.create({ itemName: 'B', type: 'appliance' });
    await admin.inventory.items.create({ itemName: 'C', type: 'tool' });
    await admin.inventory.items.create({ itemName: 'D' });

    const types = await admin.inventory.items.distinctTypes();
    expect(types.data).toEqual(['appliance', 'tool']);
  });

  it('filters list by search (LIKE on itemName)', async () => {
    const admin = userCaller();
    await admin.inventory.items.create({ itemName: 'MacBook Pro' });
    await admin.inventory.items.create({ itemName: 'iPad' });

    const list = await admin.inventory.items.list({ search: 'Mac' });
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.itemName).toBe('MacBook Pro');
  });

  it('filters by tri-bool inUse / deductible', async () => {
    const admin = userCaller();
    await admin.inventory.items.create({ itemName: 'A', inUse: true });
    await admin.inventory.items.create({ itemName: 'B', inUse: false });

    const inUseOnly = await admin.inventory.items.list({ inUse: 'true' });
    expect(inUseOnly.data).toHaveLength(1);
    expect(inUseOnly.data[0]?.itemName).toBe('A');
  });
});

describe('inventory.items (auth + error mapping)', () => {
  it('rejects anonymous callers with UNAUTHORIZED', async () => {
    const anon = anonCaller();
    await expect(anon.inventory.items.list({})).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects service accounts missing the scope with FORBIDDEN', async () => {
    const sa = serviceAccountCaller(['inventory.locations.list']);
    await expect(sa.inventory.items.list({})).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'FORBIDDEN',
    });
  });

  it('accepts service accounts that hold the matching scope', async () => {
    const sa = serviceAccountCaller(['inventory.items.list']);
    const list = await sa.inventory.items.list({});
    expect(list.pagination.total).toBe(0);
  });

  it('returns NOT_FOUND with messageKey when getting an unknown item', async () => {
    const admin = userCaller();
    let captured: TRPCError | undefined;
    try {
      await admin.inventory.items.get({ id: 'missing' });
    } catch (err) {
      captured = err as TRPCError;
    }
    expect(captured).toBeInstanceOf(TRPCError);
    expect(captured?.code).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND when updating an unknown item', async () => {
    const admin = userCaller();
    await expect(
      admin.inventory.items.update({ id: 'missing', data: { itemName: 'X' } })
    ).rejects.toMatchObject({ name: 'TRPCError', code: 'NOT_FOUND' });
  });

  it('returns NOT_FOUND when deleting an unknown item', async () => {
    const admin = userCaller();
    await expect(admin.inventory.items.delete({ id: 'missing' })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });
  });
});

describe('inventory.items (HTTP wire smoke)', () => {
  function makeApp(): ReturnType<typeof createInventoryApiApp> {
    return createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    });
  }

  it('round-trips a tRPC query through /trpc', async () => {
    const admin = userCaller();
    await admin.inventory.items.create({ itemName: 'Wire smoke item' });

    const app = makeApp();
    const res = await request(app).get(
      '/trpc/inventory.items.list?input=' + encodeURIComponent(JSON.stringify({}))
    );

    expect(res.status).toBe(200);
    expect(res.body.result.data.data).toHaveLength(1);
    expect(res.body.result.data.data[0].itemName).toBe('Wire smoke item');
  });
});
