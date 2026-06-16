/**
 * Integration tests for the `aliases.*` REST surface — CRUD plus the bulk
 * merge / approve operations. UNIQUE collisions map to 409; merge + approve
 * return their service counts.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type IngredientRow, type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createIngredient } from '../../db/services/ingredients.js';
import { createFoodApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let foodDb: OpenedFoodDb;
let ingA: IngredientRow;
let ingB: IngredientRow;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-aliases-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  ingA = createIngredient(foodDb.db, {
    name: 'Coriander',
    slug: 'coriander',
    defaultUnit: 'count',
  });
  ingB = createIngredient(foodDb.db, { name: 'Cilantro', slug: 'cilantro', defaultUnit: 'count' });
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('aliases REST', () => {
  it('creates, lists, renames and deletes an alias', async () => {
    const api = client();
    const created = await api.aliases.create({
      alias: 'dhania',
      target: { kind: 'ingredient', id: ingA.id },
    });
    expect(created.data.alias).toBe('dhania');
    expect(created.data.ingredientId).toBe(ingA.id);
    expect(created.data.source).toBe('user');

    const list = await api.aliases.list();
    expect(list.items.map((a) => a.alias)).toContain('dhania');

    const renamed = await api.aliases.updateText(created.data.id, 'dhaniya');
    expect(renamed.data.alias).toBe('dhaniya');

    const del = await api.aliases.delete(created.data.id);
    expect(del).toEqual({ ok: true });
  });

  it('maps a duplicate alias for the same target to 409', async () => {
    const api = client();
    await api.aliases.create({ alias: 'dhania', target: { kind: 'ingredient', id: ingA.id } });
    await expect(
      api.aliases.create({ alias: 'dhania', target: { kind: 'ingredient', id: ingA.id } })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('bulk-approves llm aliases to user', async () => {
    const api = client();
    const a = await api.aliases.create({
      alias: 'koriander',
      target: { kind: 'ingredient', id: ingA.id },
      source: 'llm',
    });
    const res = await api.aliases.bulkApprove([a.data.id]);
    expect(res.updatedCount).toBe(1);

    const list = await api.aliases.list({ source: 'user' });
    expect(list.items.some((x) => x.id === a.data.id)).toBe(true);
  });

  it('merges aliases onto a single target', async () => {
    const api = client();
    const a = await api.aliases.create({
      alias: 'chinese-parsley',
      target: { kind: 'ingredient', id: ingA.id },
    });
    const res = await api.aliases.merge([a.data.id], { kind: 'ingredient', id: ingB.id });
    expect(res.mergedCount).toBeGreaterThanOrEqual(1);

    // merge re-points by delete + re-insert, so the row id changes — assert
    // on the stable alias text instead.
    const all = await api.aliases.list();
    const moved = all.items.find((x) => x.alias === 'chinese-parsley');
    expect(moved?.ingredientId).toBe(ingB.id);
  });
});
