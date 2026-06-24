/**
 * Integration tests for the `search.*` REST surface — inventory's slice of
 * unified search.
 *
 * The suite seeds items through the pillar's own CRUD endpoint, then asserts
 * the TIERED ranking: exact assetId (1.0) > assetId prefix (0.9)
 * > itemName exact (0.85) / prefix (0.7) / contains (0.5), with the
 * `/inventory/items/<id>` uri shape, the dedup between asset and name tiers,
 * and descending score sort. An empty / whitespace query short-circuits to an
 * empty hit list.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-search-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3005',
    })
  );
}

describe('search — inventory items adapter', () => {
  it('returns an exact-assetId hit scored 1.0 with the legacy uri shape', async () => {
    const created = await client().items.create({ itemName: 'Laptop', assetId: 'AST-001' });

    const { hits } = await client().search.run({ query: { text: 'ast-001' } });
    expect(hits).toHaveLength(1);
    const [hit] = hits;
    expect(hit.uri).toBe(`/inventory/items/${created.data.id}`);
    expect(hit.score).toBe(1.0);
    expect(hit.matchField).toBe('assetId');
    expect(hit.matchType).toBe('exact');
    expect(hit.data).toMatchObject({ itemName: 'Laptop', assetId: 'AST-001' });
  });

  it('orders asset-exact (1.0) > asset-prefix (0.9) and dedups the same row across tiers', async () => {
    const exact = await client().items.create({ itemName: 'Router', assetId: 'AST-100' });
    const prefixed = await client().items.create({ itemName: 'Switch', assetId: 'AST-1000' });

    const { hits } = await client().search.run({ query: { text: 'ast-100' } });
    expect(hits.map((h) => h.uri)).toEqual([
      `/inventory/items/${exact.data.id}`,
      `/inventory/items/${prefixed.data.id}`,
    ]);
    expect(hits.map((h) => h.score)).toEqual([1.0, 0.9]);
    expect(hits.map((h) => h.matchType)).toEqual(['exact', 'prefix']);
  });

  it('ranks itemName matches exact (0.85) > prefix (0.7) > contains (0.5)', async () => {
    await client().items.create({ itemName: 'Drill' });
    await client().items.create({ itemName: 'Drill bit set' });
    await client().items.create({ itemName: 'Cordless Drill' });

    const { hits } = await client().search.run({ query: { text: 'drill' } });
    expect(hits.map((h) => h.data['itemName'])).toEqual([
      'Drill',
      'Drill bit set',
      'Cordless Drill',
    ]);
    expect(hits.map((h) => h.score)).toEqual([0.85, 0.7, 0.5]);
    expect(hits.every((h) => h.matchField === 'itemName')).toBe(true);
  });

  it('places an asset match above any name match', async () => {
    const asset = await client().items.create({ itemName: 'Camera', assetId: 'CAM-1' });
    await client().items.create({ itemName: 'CAM-1 spare battery' });

    const { hits } = await client().search.run({ query: { text: 'cam-1' } });
    expect(hits[0].uri).toBe(`/inventory/items/${asset.data.id}`);
    expect(hits[0].score).toBe(1.0);
    expect(hits[0].matchField).toBe('assetId');
  });

  it('returns an empty list for an empty or whitespace query', async () => {
    await client().items.create({ itemName: 'Anything', assetId: 'AST-9' });
    expect((await client().search.run({ query: { text: '' } })).hits).toEqual([]);
    expect((await client().search.run({ query: { text: '   ' } })).hits).toEqual([]);
  });
});
