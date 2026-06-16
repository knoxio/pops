/**
 * Integration tests for the `ingredientTags.*` REST surface. `set` is a
 * full replacement; validation failures surface as a structured
 * `{ ok: false, reason }` (200), not an HTTP error.
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
let ing: IngredientRow;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-ingredient-tags-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  ing = createIngredient(foodDb.db, { name: 'Carrot', slug: 'carrot', defaultUnit: 'count' });
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('ingredientTags REST', () => {
  it('sets and lists tags (full replacement)', async () => {
    const api = client();
    const set = await api.ingredientTags.set(ing.id, ['store-section:produce', 'diet:vegan']);
    expect(set).toEqual({ ok: true });

    const list = await api.ingredientTags.list(ing.id);
    expect(list.tags.toSorted()).toEqual(['diet:vegan', 'store-section:produce']);

    await api.ingredientTags.set(ing.id, ['diet:vegan']);
    const after = await api.ingredientTags.list(ing.id);
    expect(after.tags).toEqual(['diet:vegan']);
  });

  it('rejects a malformed tag with ok:false / BadTagFormat', async () => {
    const res = await client().ingredientTags.set(ing.id, ['Not A Tag!']);
    expect(res).toEqual({ ok: false, reason: 'BadTagFormat' });
  });

  it('reports an unknown ingredient as ok:false / IngredientNotFound', async () => {
    const res = await client().ingredientTags.set(999999, ['diet:vegan']);
    expect(res).toEqual({ ok: false, reason: 'IngredientNotFound' });
  });

  it('lists distinct tags with counts and finds ingredients by tag', async () => {
    const api = client();
    const beet = createIngredient(foodDb.db, { name: 'Beet', slug: 'beet', defaultUnit: 'count' });
    await api.ingredientTags.set(ing.id, ['store-section:produce']);
    await api.ingredientTags.set(beet.id, ['store-section:produce']);

    const distinct = await api.ingredientTags.distinct({ namespacePrefix: 'store-section' });
    const row = distinct.tags.find((t) => t.tag === 'store-section:produce');
    expect(row?.ingredientCount).toBe(2);

    const byTag = await api.ingredientTags.byTag('store-section:produce');
    expect(byTag.ingredients.map((i) => i.slug).toSorted()).toEqual(['beet', 'carrot']);
  });
});
