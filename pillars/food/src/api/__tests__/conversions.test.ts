/**
 * Integration tests for the `conversions.*` REST surface in pops-food-api.
 *
 * Boots the Express app via `createFoodApiApp` against a per-test temp
 * food.db and drives endpoints through supertest (see `makeClient`). Domain
 * errors translate to HTTP status: UNIQUE → 409, expectRow-miss → 404, zod
 * failures → 400; seeded-row deletes answer `{ ok: false, reason: 'seeded' }`
 * with a 200. No auth layer — the pillar trusts the docker network.
 *
 * Resolution maths (gram lookups, ratio chains) live in the db package's
 * own tests; here we assert the wire envelope + error mapping only.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { conversionsService, type OpenedFoodDb, openFoodDb } from '../../db/index.js';
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
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-conversions-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('conversions REST — unit conversions', () => {
  it('creates, lists, updates and deletes a unit conversion', async () => {
    const api = client();
    const created = await api.conversions.createUnit({ fromUnit: 'cup', toUnit: 'ml', ratio: 240 });
    expect(created.data.fromUnit).toBe('cup');
    expect(created.data.toUnit).toBe('ml');
    expect(created.data.ratio).toBe(240);
    expect(created.data.seeded).toBe(false);

    const list = await api.conversions.listUnits();
    expect(list.items).toHaveLength(1);

    const updated = await api.conversions.updateUnit(created.data.id, { ratio: 250 });
    expect(updated.data.ratio).toBe(250);

    const del = await api.conversions.deleteUnit(created.data.id);
    expect(del).toEqual({ ok: true });

    const after = await api.conversions.listUnits();
    expect(after.items).toHaveLength(0);
  });

  it('maps a duplicate (fromUnit,toUnit) to 409', async () => {
    const api = client();
    await api.conversions.createUnit({ fromUnit: 'cup', toUnit: 'ml', ratio: 240 });
    await expect(
      api.conversions.createUnit({ fromUnit: 'cup', toUnit: 'ml', ratio: 999 })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('maps an update of an unknown id to 404', async () => {
    await expect(client().conversions.updateUnit(424242, { ratio: 1 })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rejects an empty fromUnit at the zod boundary with 400', async () => {
    await expect(
      client().conversions.createUnit({ fromUnit: '', toUnit: 'g', ratio: 1 })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns ok:false / seeded when deleting a seeded row', async () => {
    const api = client();
    const seeded = conversionsService.createUnitConversion(foodDb.db, {
      fromUnit: 'tbsp',
      toUnit: 'ml',
      ratio: 15,
      isSeeded: true,
    });
    const res = await api.conversions.deleteUnit(seeded.id);
    expect(res).toEqual({ ok: false, reason: 'seeded' });
  });
});

describe('conversions REST — ingredient weights', () => {
  it('creates and lists an ingredient weight scoped to its ingredient', async () => {
    const api = client();
    const ing = createIngredient(foodDb.db, { name: 'Flour', slug: 'flour', defaultUnit: 'g' });

    const created = await api.conversions.createWeight({
      ingredientId: ing.id,
      unit: 'cup',
      grams: 120,
    });
    expect(created.data.ingredientId).toBe(ing.id);
    expect(created.data.grams).toBe(120);

    const scoped = await api.conversions.listWeights({ ingredientId: ing.id });
    expect(scoped.items).toHaveLength(1);

    const empty = await api.conversions.listWeights({ ingredientId: ing.id + 1 });
    expect(empty.items).toHaveLength(0);
  });
});

describe('conversions REST — resolve', () => {
  it('carries identity units through unchanged', async () => {
    const res = await client().conversions.resolve({ ingredientId: 1, unit: 'g', qty: 50 });
    expect(res).toEqual({ kind: 'resolved', canonicalUnit: 'g', qty: 50 });
  });

  it('falls back to unresolved when nothing covers the unit', async () => {
    const res = await client().conversions.resolve({ ingredientId: 1, unit: 'pinch', qty: 3 });
    expect(res).toEqual({ kind: 'unresolved' });
  });

  it('applies a unit conversion ratio when one exists', async () => {
    const api = client();
    await api.conversions.createUnit({ fromUnit: 'cup', toUnit: 'ml', ratio: 240 });
    const res = await api.conversions.resolve({ ingredientId: 1, unit: 'cup', qty: 2 });
    expect(res).toEqual({ kind: 'resolved', canonicalUnit: 'ml', qty: 480 });
  });
});
