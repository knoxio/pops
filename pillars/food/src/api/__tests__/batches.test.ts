/**
 * Integration tests for the `batches.*` REST surface — PRD-145 lifecycle +
 * PRD-146 picker. Lifecycle mutations return the service's discriminated
 * `{ ok, ... }` result (200); `create` answers 201/400; `get` 404s on a
 * missing batch. Lifecycle invariants live in the db tests.
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
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-batches-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  const ing = createIngredient(foodDb.db, { name: 'Carrot', slug: 'carrot', defaultUnit: 'g' });
  variantId = createVariant(foodDb.db, {
    ingredientId: ing.id,
    slug: 'carrot-loose',
    name: 'Loose Carrot',
    defaultUnit: 'g',
  }).id;
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('batches REST — lifecycle', () => {
  it('creates, gets, relocates, edits, adjusts and deletes a batch', async () => {
    const api = client();
    const created = await api.batches.create({
      variantId,
      prepStateId: null,
      qty: 500,
      unit: 'g',
      location: 'pantry',
      sourceType: 'purchase',
    });
    expect(created.batchId).toBeGreaterThan(0);

    const got = await api.batches.get(created.batchId);
    expect(got.data.qtyRemaining).toBe(500);
    expect(got.data.location).toBe('pantry');

    expect(await api.batches.relocate(created.batchId, 'fridge')).toEqual({ ok: true });
    expect(await api.batches.edit(created.batchId, { notes: 'opened' })).toEqual({ ok: true });

    const adjusted = await api.batches.adjustQty(created.batchId, -100, 'spoiled');
    expect(adjusted).toEqual({ ok: true, newQty: 400 });

    expect(await api.batches.delete(created.batchId)).toEqual({ ok: true });
  });

  it('404s on a missing batch get', async () => {
    await expect(client().batches.get(999999)).rejects.toMatchObject({ status: 404 });
  });

  it('returns ok:false / BatchNotFound for lifecycle ops on a missing batch', async () => {
    const res = await client().batches.relocate(999999, 'fridge');
    expect(res).toEqual({ ok: false, reason: 'BatchNotFound' });
  });

  it('rejects a positive delta for a spoiled adjustment as ok:false', async () => {
    const api = client();
    const b = await api.batches.create({
      variantId,
      prepStateId: null,
      qty: 100,
      unit: 'g',
      location: 'pantry',
      sourceType: 'purchase',
    });
    const res = await api.batches.adjustQty(b.batchId, 50, 'spoiled');
    expect(res).toMatchObject({ ok: false });
  });
});

describe('batches REST — searchForConsume', () => {
  it('returns non-empty batches FIFO for the picker', async () => {
    const api = client();
    await api.batches.create({
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'pantry',
      sourceType: 'purchase',
    });
    const res = await api.batches.searchForConsume({ variantId });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.variantId).toBe(variantId);
  });
});
