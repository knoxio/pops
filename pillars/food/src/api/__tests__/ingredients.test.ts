/**
 * Integration tests for the `ingredients.*` REST surface — CRUD, slug
 * rename, re-parent, and the soft-blocked delete. Hierarchy depth / cycle
 * invariants live in the db tests; here we assert the wire envelopes + HTTP
 * status mapping.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let foodDb: OpenedFoodDb;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-ingredients-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('ingredients REST — CRUD', () => {
  it('creates, lists, gets (by id and slug), and updates', async () => {
    const api = client();
    const created = await api.ingredients.create({
      slug: 'tomato',
      name: 'Tomato',
      defaultUnit: 'count',
    });
    expect(created.data.slug).toBe('tomato');

    const list = await api.ingredients.list();
    expect(list.items.map((i) => i.slug)).toContain('tomato');

    const byId = await api.ingredients.get(created.data.id);
    expect(byId.ingredient.slug).toBe('tomato');
    expect(byId.variants).toEqual([]);

    const bySlug = await api.ingredients.get('tomato');
    expect(bySlug.ingredient.id).toBe(created.data.id);

    const updated = await api.ingredients.update(created.data.id, { name: 'Roma Tomato' });
    expect(updated.data.name).toBe('Roma Tomato');
  });

  it('maps an invalid slug to 400 and a duplicate slug to 409', async () => {
    const api = client();
    await expect(
      api.ingredients.create({ slug: 'Bad Slug!', name: 'x', defaultUnit: 'count' })
    ).rejects.toMatchObject({ status: 400 });

    await api.ingredients.create({ slug: 'onion', name: 'Onion', defaultUnit: 'count' });
    await expect(
      api.ingredients.create({ slug: 'onion', name: 'Onion 2', defaultUnit: 'count' })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('maps an unknown ingredient to 404 on get and update', async () => {
    const api = client();
    await expect(api.ingredients.get('nope')).rejects.toMatchObject({ status: 404 });
    await expect(api.ingredients.update(999999, { name: 'x' })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('ingredients REST — hierarchy', () => {
  it('renames a slug and re-parents under another ingredient', async () => {
    const api = client();
    const parent = await api.ingredients.create({
      slug: 'allium',
      name: 'Allium',
      defaultUnit: 'count',
    });
    const child = await api.ingredients.create({
      slug: 'garlik',
      name: 'Garlic',
      defaultUnit: 'count',
    });

    const renamed = await api.ingredients.rename('garlik', 'garlic');
    expect(renamed.data.slug).toBe('garlic');

    const reparented = await api.ingredients.changeParent(child.data.id, parent.data.id);
    expect(reparented.data.parentId).toBe(parent.data.id);

    const children = await api.ingredients.list({ parentId: parent.data.id });
    expect(children.items.map((i) => i.slug)).toContain('garlic');
  });

  it('maps a rename of an unknown slug to 404', async () => {
    await expect(client().ingredients.rename('ghost', 'phantom')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('ingredients REST — delete blockers', () => {
  it('deletes a blocker-free ingredient', async () => {
    const api = client();
    const ing = await api.ingredients.create({ slug: 'salt', name: 'Salt', defaultUnit: 'g' });
    const blockers = await api.ingredients.blockers(ing.data.id);
    expect(blockers.data).toEqual({ variants: 0, aliases: 0 });

    const del = await api.ingredients.delete(ing.data.id);
    expect(del).toEqual({ ok: true });
  });

  it('soft-blocks delete when a variant exists, reporting blockers', async () => {
    const api = client();
    const ing = await api.ingredients.create({ slug: 'milk', name: 'Milk', defaultUnit: 'ml' });
    await api.variants.create({
      ingredientId: ing.data.id,
      slug: 'whole',
      name: 'Whole',
      defaultUnit: 'ml',
    });

    const del = await api.ingredients.delete(ing.data.id);
    expect(del).toEqual({ ok: false, blockers: { variants: 1, aliases: 0 } });
  });
});
