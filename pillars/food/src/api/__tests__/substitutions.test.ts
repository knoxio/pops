/**
 * Integration tests for the `substitutions.*` REST surface — CRUD, the
 * graph-view projection, and the resolve-line error path. The substitution
 * resolution maths + graph assembly live in the db package's tests; here we
 * assert the wire envelopes + HTTP status mapping.
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
let from: IngredientRow;
let to: IngredientRow;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-substitutions-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  from = createIngredient(foodDb.db, { name: 'Butter', slug: 'butter', defaultUnit: 'g' });
  to = createIngredient(foodDb.db, { name: 'Olive Oil', slug: 'olive-oil', defaultUnit: 'ml' });
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('substitutions REST — CRUD', () => {
  it('creates, lists, updates and deletes a global substitution', async () => {
    const api = client();
    const created = await api.substitutions.create({
      from: { ingredientId: from.id },
      to: { ingredientId: to.id },
      ratio: 0.8,
    });
    expect(created.data.fromIngredientId).toBe(from.id);
    expect(created.data.toIngredientId).toBe(to.id);
    expect(created.data.scope).toBe('global');

    const list = await api.substitutions.list();
    expect(list.items).toHaveLength(1);

    const updated = await api.substitutions.update(created.data.id, { ratio: 1.2 });
    expect(updated.data.ratio).toBe(1.2);

    const del = await api.substitutions.delete(created.data.id);
    expect(del).toEqual({ ok: true });
    expect((await api.substitutions.list()).items).toHaveLength(0);
  });

  it('rejects an endpoint that sets neither id with 400', async () => {
    await expect(
      client().substitutions.create({ from: {}, to: { ingredientId: to.id } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps a self-substitution to 400', async () => {
    await expect(
      client().substitutions.create({
        from: { ingredientId: from.id },
        to: { ingredientId: from.id },
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects scope=recipe without a recipeId with 400', async () => {
    await expect(
      client().substitutions.create({
        from: { ingredientId: from.id },
        to: { ingredientId: to.id },
        scope: 'recipe',
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('substitutions REST — graph view', () => {
  it('projects nodes and edges from the stored substitutions', async () => {
    const api = client();
    await api.substitutions.create({
      from: { ingredientId: from.id },
      to: { ingredientId: to.id },
    });
    const graph = await api.substitutions.graphView();
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes.map((n) => n.id).toSorted()).toEqual([
      `ingredient:${from.id}`,
      `ingredient:${to.id}`,
    ]);
  });
});

describe('substitutions REST — resolve line', () => {
  it('maps an unknown recipe line to 404', async () => {
    await expect(client().substitutions.resolveForLine(999999, 1)).rejects.toMatchObject({
      status: 404,
    });
  });
});
