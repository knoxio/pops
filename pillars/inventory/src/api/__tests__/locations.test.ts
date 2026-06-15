/**
 * Integration tests for the migrated `inventory.locations.*` tRPC
 * surface inside pops-inventory-api (Phase 5 PR 1 / Track M4).
 *
 * Two layers of coverage:
 *
 *   1. tRPC caller smoke — drives `appRouter.createCaller(ctx)` against
 *      a per-test in-memory inventory.db. Asserts the same shape contract
 *      the legacy pops-api router enforced (list/get/tree/create/update/
 *      delete happy paths, NOT_FOUND on unknown ids, CONFLICT on cycles
 *      and self-parent, UNAUTHORIZED when no principal is present).
 *
 *   2. HTTP wire smoke — boots the Express app via `createInventoryApiApp`
 *      and round-trips one query over `/trpc` with supertest. Proves
 *      `createExpressMiddleware` is wired up and the context factory
 *      reaches the inventory DB.
 *
 * Service-layer invariants (cycle detection, tree assembly, cascade
 * delete) already live in `packages/inventory-db/src/__tests__/` —
 * duplicating them here would just test drizzle.
 *
 * Out of scope for this PR: the legacy router's `getItems` procedure,
 * which depends on `toInventoryItem` from the items module — that slice
 * is still in pops-api and will migrate in a follow-up PR. The legacy
 * pops-api router keeps serving `inventory.locations.getItems` (and
 * every other `inventory.*` route) as fall-through until Phase 5 PR 2
 * flips the dispatcher.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { locationsService, openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { appRouter } from '../router.js';
import { type Context } from '../trpc.js';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-loc-test-'));
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

describe('inventory.locations (tRPC caller — happy paths)', () => {
  it('lets a human admin create, list, get, then delete a location', async () => {
    const admin = userCaller();
    const created = await admin.inventory.locations.create({ name: 'Home' });
    expect(created.data.name).toBe('Home');
    expect(created.data.parentId).toBeNull();

    const list = await admin.inventory.locations.list();
    expect(list.total).toBe(1);
    expect(list.data[0]?.name).toBe('Home');

    const fetched = await admin.inventory.locations.get({ id: created.data.id });
    expect(fetched.data.name).toBe('Home');

    const ack = await admin.inventory.locations.delete({ id: created.data.id });
    expect(ack).toEqual({ message: 'Location deleted' });

    const after = await admin.inventory.locations.list();
    expect(after.total).toBe(0);
  });

  it('builds a nested tree across parent-child rows', async () => {
    const admin = userCaller();
    const home = await admin.inventory.locations.create({ name: 'Home' });
    const kitchen = await admin.inventory.locations.create({
      name: 'Kitchen',
      parentId: home.data.id,
    });
    await admin.inventory.locations.create({ name: 'Pantry', parentId: kitchen.data.id });

    const tree = await admin.inventory.locations.tree();
    expect(tree.data).toHaveLength(1);
    expect(tree.data[0]?.name).toBe('Home');
    expect(tree.data[0]?.children).toHaveLength(1);
    expect(tree.data[0]?.children[0]?.name).toBe('Kitchen');
    expect(tree.data[0]?.children[0]?.children[0]?.name).toBe('Pantry');
  });

  it('returns a root-first breadcrumb path', async () => {
    const admin = userCaller();
    const home = await admin.inventory.locations.create({ name: 'Home' });
    const kitchen = await admin.inventory.locations.create({
      name: 'Kitchen',
      parentId: home.data.id,
    });
    const pantry = await admin.inventory.locations.create({
      name: 'Pantry',
      parentId: kitchen.data.id,
    });

    const path = await admin.inventory.locations.getPath({ id: pantry.data.id });
    expect(path.data.map((row) => row.name)).toEqual(['Home', 'Kitchen', 'Pantry']);
  });

  it('lists direct children only', async () => {
    const admin = userCaller();
    const home = await admin.inventory.locations.create({ name: 'Home' });
    await admin.inventory.locations.create({ name: 'Kitchen', parentId: home.data.id });
    await admin.inventory.locations.create({ name: 'Bedroom', parentId: home.data.id });
    await admin.inventory.locations.create({ name: 'Car' });

    const children = await admin.inventory.locations.children({ parentId: home.data.id });
    expect(children.data).toHaveLength(2);
    expect(children.data.map((row) => row.name).toSorted()).toEqual(['Bedroom', 'Kitchen']);
  });

  it('updates a location name', async () => {
    const admin = userCaller();
    const created = await admin.inventory.locations.create({ name: 'Old Name' });
    const updated = await admin.inventory.locations.update({
      id: created.data.id,
      data: { name: 'New Name' },
    });
    expect(updated.data.name).toBe('New Name');
  });

  it('requires confirmation before deleting a populated location', async () => {
    const admin = userCaller();
    const home = await admin.inventory.locations.create({ name: 'Home' });
    await admin.inventory.locations.create({ name: 'Kitchen', parentId: home.data.id });

    const res = await admin.inventory.locations.delete({ id: home.data.id });
    expect(res).toMatchObject({ requiresConfirmation: true });

    const forced = await admin.inventory.locations.delete({ id: home.data.id, force: true });
    expect(forced).toEqual({ message: 'Location deleted' });
  });
});

describe('inventory.locations (auth + error mapping)', () => {
  it('rejects callers with no principal as UNAUTHORIZED', async () => {
    const anon = anonCaller();
    await expect(anon.inventory.locations.list()).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });

  it('accepts a service-account caller that holds the matching scope', async () => {
    const sa = serviceAccountCaller(['inventory.locations']);
    const created = await sa.inventory.locations.create({ name: 'WarehouseBot' });
    expect(created.data.name).toBe('WarehouseBot');
  });

  it('rejects a service-account caller without scope coverage as FORBIDDEN', async () => {
    const sa = serviceAccountCaller(['food.recipes']);
    await expect(sa.inventory.locations.list()).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'FORBIDDEN',
    });
  });

  it('maps LocationNotFoundError to NOT_FOUND', async () => {
    const admin = userCaller();
    await expect(admin.inventory.locations.get({ id: 'nope' })).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });
  });

  it('maps ParentLocationNotFoundError to NOT_FOUND on create', async () => {
    const admin = userCaller();
    await expect(
      admin.inventory.locations.create({ name: 'Orphan', parentId: 'missing' })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'NOT_FOUND',
    });
  });

  it('maps LocationSelfParentError to CONFLICT on update', async () => {
    const admin = userCaller();
    const created = await admin.inventory.locations.create({ name: 'Self' });
    await expect(
      admin.inventory.locations.update({
        id: created.data.id,
        data: { parentId: created.data.id },
      })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'CONFLICT',
    });
  });

  it('maps LocationCycleError to CONFLICT on update', async () => {
    const admin = userCaller();
    const home = await admin.inventory.locations.create({ name: 'Home' });
    const kitchen = await admin.inventory.locations.create({
      name: 'Kitchen',
      parentId: home.data.id,
    });
    await expect(
      admin.inventory.locations.update({
        id: home.data.id,
        data: { parentId: kitchen.data.id },
      })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'CONFLICT',
    });
  });

  it('rejects malformed input at the zod boundary', async () => {
    const admin = userCaller();
    await expect(admin.inventory.locations.create({ name: '' })).rejects.toBeInstanceOf(TRPCError);
  });
});

describe('/trpc HTTP surface', () => {
  function makeApp(): ReturnType<typeof createInventoryApiApp> {
    return createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    });
  }

  it('answers inventory.locations.list over HTTP (dev context auto-authenticates)', async () => {
    const app = makeApp();
    const res = await request(app).get('/trpc/inventory.locations.list');
    expect(res.status).toBe(200);
    expect(res.body.result.data).toEqual({ data: [], total: 0 });
  });

  it('round-trips a create mutation and reads it back', async () => {
    const app = makeApp();
    const created = await request(app)
      .post('/trpc/inventory.locations.create')
      .send({ name: 'Garage' });
    expect(created.status).toBe(200);
    expect(created.body.result.data.data.name).toBe('Garage');

    // Service-layer write should be visible without rebooting the app.
    const rows = locationsService.listLocations(inventoryDb.db);
    expect(rows.total).toBe(1);
    expect(rows.rows[0]?.name).toBe('Garage');
  });
});
