/**
 * Integration tests for the `locations.*` REST surface in
 * pops-inventory-api.
 *
 * Boots the Express app via `createInventoryApiApp` against a per-test
 * temp inventory.db and drives endpoints through supertest (see
 * `makeClient`). Domain errors translate to HTTP status: NotFound → 404,
 * cycle / self-parent → 409, zod failures → 400. No auth layer — the
 * pillar trusts the docker network.
 *
 * Service-layer invariants (cycle detection, tree assembly, cascade
 * delete) live in the db package's own tests; duplicating them here would
 * just test drizzle.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { locationsService, openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

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
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-loc-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('locations REST — happy paths', () => {
  it('creates, lists, gets, then deletes a location', async () => {
    const api = client();
    const created = await api.locations.create({ name: 'Home' });
    expect(created.data.name).toBe('Home');
    expect(created.data.parentId).toBeNull();

    const list = await api.locations.list();
    expect(list.total).toBe(1);
    expect(list.data[0]?.name).toBe('Home');

    const fetched = await api.locations.get(created.data.id);
    expect(fetched.data.name).toBe('Home');

    const ack = await api.locations.delete(created.data.id);
    expect(ack).toEqual({ message: 'Location deleted' });

    const after = await api.locations.list();
    expect(after.total).toBe(0);
  });

  it('builds a nested tree across parent-child rows', async () => {
    const api = client();
    const home = await api.locations.create({ name: 'Home' });
    const kitchen = await api.locations.create({ name: 'Kitchen', parentId: home.data.id });
    await api.locations.create({ name: 'Pantry', parentId: kitchen.data.id });

    const tree = await api.locations.tree();
    expect(tree.data).toHaveLength(1);
    expect(tree.data[0]?.name).toBe('Home');
    expect(tree.data[0]?.children).toHaveLength(1);
    expect(tree.data[0]?.children[0]?.name).toBe('Kitchen');
    expect(tree.data[0]?.children[0]?.children[0]?.name).toBe('Pantry');
  });

  it('returns a root-first breadcrumb path', async () => {
    const api = client();
    const home = await api.locations.create({ name: 'Home' });
    const kitchen = await api.locations.create({ name: 'Kitchen', parentId: home.data.id });
    const pantry = await api.locations.create({ name: 'Pantry', parentId: kitchen.data.id });

    const path = await api.locations.getPath(pantry.data.id);
    expect(path.data.map((row) => row.name)).toEqual(['Home', 'Kitchen', 'Pantry']);
  });

  it('lists direct children only', async () => {
    const api = client();
    const home = await api.locations.create({ name: 'Home' });
    await api.locations.create({ name: 'Kitchen', parentId: home.data.id });
    await api.locations.create({ name: 'Bedroom', parentId: home.data.id });
    await api.locations.create({ name: 'Car' });

    const children = await api.locations.children(home.data.id);
    expect(children.data).toHaveLength(2);
    expect(children.data.map((row) => row.name).toSorted()).toEqual(['Bedroom', 'Kitchen']);
  });

  it('updates a location name', async () => {
    const api = client();
    const created = await api.locations.create({ name: 'Old Name' });
    const updated = await api.locations.update(created.data.id, { name: 'New Name' });
    expect(updated.data.name).toBe('New Name');
  });

  it('requires confirmation before deleting a populated location', async () => {
    const api = client();
    const home = await api.locations.create({ name: 'Home' });
    await api.locations.create({ name: 'Kitchen', parentId: home.data.id });

    const res = await api.locations.delete(home.data.id);
    expect(res).toMatchObject({ requiresConfirmation: true });

    const forced = await api.locations.delete(home.data.id, true);
    expect(forced).toEqual({ message: 'Location deleted' });
  });
});

describe('locations REST — error mapping', () => {
  it('maps an unknown location to 404', async () => {
    await expect(client().locations.get('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('maps a missing parent to 404 on create', async () => {
    await expect(
      client().locations.create({ name: 'Orphan', parentId: 'missing' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('maps a self-parent to 409 on update', async () => {
    const api = client();
    const created = await api.locations.create({ name: 'Self' });
    await expect(
      api.locations.update(created.data.id, { parentId: created.data.id })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('maps a cycle to 409 on update', async () => {
    const api = client();
    const home = await api.locations.create({ name: 'Home' });
    const kitchen = await api.locations.create({ name: 'Kitchen', parentId: home.data.id });
    await expect(
      api.locations.update(home.data.id, { parentId: kitchen.data.id })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects an empty name at the zod boundary with 400', async () => {
    await expect(client().locations.create({ name: '' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('locations REST — raw HTTP wire smoke', () => {
  it('GET /locations answers 200 with an empty envelope', async () => {
    const app = createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    });
    const res = await request(app).get('/locations');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], total: 0 });
  });

  it('round-trips a create mutation and reads it back from the service', async () => {
    const app = createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    });
    const created = await request(app).post('/locations').send({ name: 'Garage' });
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe('Garage');

    const rows = locationsService.listLocations(inventoryDb.db);
    expect(rows.total).toBe(1);
    expect(rows.rows[0]?.name).toBe('Garage');
  });
});
