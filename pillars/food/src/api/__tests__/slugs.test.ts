/**
 * Integration tests for the `slugs.*` REST search surface. Verifies the
 * registry is searchable across kinds and that the `kinds` filter narrows
 * results. Resolution mechanics live in the db package's tests.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createIngredient } from '../../db/services/ingredients.js';
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
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-slugs-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('slugs REST search', () => {
  it('finds a registered ingredient slug by substring', async () => {
    createIngredient(foodDb.db, { name: 'Tomato', slug: 'tomato', defaultUnit: 'count' });
    const api = client();
    const res = await api.slugs.search({ query: 'toma' });
    const match = res.items.find((m) => m.slug === 'tomato');
    expect(match).toBeDefined();
    expect(match?.kind).toBe('ingredient');
    expect(match?.name).toBe('Tomato');
  });

  it('narrows results by kind', async () => {
    createIngredient(foodDb.db, { name: 'Basil', slug: 'basil', defaultUnit: 'count' });
    const api = client();
    const onlyRecipes = await api.slugs.search({ query: 'basil', kinds: ['recipe'] });
    expect(onlyRecipes.items.some((m) => m.slug === 'basil')).toBe(false);

    const onlyIngredients = await api.slugs.search({ query: 'basil', kinds: ['ingredient'] });
    expect(onlyIngredients.items.some((m) => m.slug === 'basil')).toBe(true);
  });

  it('returns an empty list for a non-matching query', async () => {
    const res = await client().slugs.search({ query: 'zzz-nothing' });
    expect(res.items).toEqual([]);
  });
});
