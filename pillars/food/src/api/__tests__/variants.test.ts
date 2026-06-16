/**
 * Integration tests for the `variants.*` REST surface. Slug validation →
 * 400, per-ingredient slug collision → 409, unknown id on update/delete →
 * 404. Variant slug scoping + FK cascades are covered in the db tests.
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
let ingredient: IngredientRow;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-variants-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  ingredient = createIngredient(foodDb.db, { name: 'Milk', slug: 'milk', defaultUnit: 'ml' });
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('variants REST', () => {
  it('creates, updates and deletes a variant', async () => {
    const api = client();
    const created = await api.variants.create({
      ingredientId: ingredient.id,
      slug: 'whole-milk',
      name: 'Whole Milk',
      defaultUnit: 'ml',
    });
    expect(created.data.ingredientId).toBe(ingredient.id);
    expect(created.data.slug).toBe('whole-milk');

    const updated = await api.variants.update(created.data.id, { name: 'Full Fat Milk' });
    expect(updated.data.name).toBe('Full Fat Milk');

    const del = await api.variants.delete(created.data.id);
    expect(del).toEqual({ ok: true });
  });

  it('maps an invalid slug to 400', async () => {
    await expect(
      client().variants.create({
        ingredientId: ingredient.id,
        slug: 'Bad Slug!',
        name: 'x',
        defaultUnit: 'ml',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps a duplicate slug under the same ingredient to 409', async () => {
    const api = client();
    await api.variants.create({
      ingredientId: ingredient.id,
      slug: 'skim',
      name: 'Skim',
      defaultUnit: 'ml',
    });
    await expect(
      api.variants.create({
        ingredientId: ingredient.id,
        slug: 'skim',
        name: 'Skim 2',
        defaultUnit: 'ml',
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('maps update / delete of an unknown id to 404', async () => {
    const api = client();
    await expect(api.variants.update(999999, { name: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(api.variants.delete(999999)).rejects.toMatchObject({ status: 404 });
  });
});
