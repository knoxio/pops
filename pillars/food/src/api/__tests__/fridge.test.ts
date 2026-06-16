/**
 * Integration tests for the `fridge.*` REST surface — PRD-147 view +
 * recipes-using-batch. Both read-only; grouping/query logic lives in the
 * lifted `modules/fridge/` helpers and is covered by db-level tests.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createIngredient } from '../../db/services/ingredients.js';
import { createVariant } from '../../db/services/variants.js';
import { createFoodApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let foodDb: OpenedFoodDb;
let variantId: number;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-fridge-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  const ing = createIngredient(foodDb.db, { name: 'Peas', slug: 'peas', defaultUnit: 'g' });
  variantId = createVariant(foodDb.db, {
    ingredientId: ing.id,
    slug: 'frozen-peas',
    name: 'Frozen Peas',
    defaultUnit: 'g',
  }).id;
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('fridge REST', () => {
  it('returns an all-locations view with zeroed counts when empty', async () => {
    const view = await client().fridge.view();
    expect(view.sections).toHaveLength(4);
    expect(view.counts).toEqual({ visible: 0, empty: 0, deleted: 0 });
  });

  it('groups a created batch under its location and ingredient', async () => {
    const api = client();
    await api.batches.create({
      variantId,
      prepStateId: null,
      qty: 300,
      unit: 'g',
      location: 'freezer',
      sourceType: 'purchase',
    });

    const view = await api.fridge.view();
    expect(view.counts.visible).toBe(1);
    const freezer = view.sections.find((s) => s.location === 'freezer');
    expect(freezer?.count).toBe(1);
    expect(freezer?.ingredients).toHaveLength(1);
  });

  it('returns an empty recipe list for a batch no recipe references', async () => {
    const api = client();
    const b = await api.batches.create({
      variantId,
      prepStateId: null,
      qty: 100,
      unit: 'g',
      location: 'pantry',
      sourceType: 'purchase',
    });
    const res = await api.fridge.recipesUsingBatch(b.batchId);
    expect(res.items).toEqual([]);
  });
});
