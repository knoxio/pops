/**
 * Integration tests for the `plan.*` REST surface (PRD-143). Covers slot
 * CRUD, the week view, and a promoted-recipe addEntry happy path plus the
 * discriminated error results. Plan-service invariants live in the db tests.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createIngredient } from '../../db/services/ingredients.js';
import { createFoodApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

const OMELETTE = `@recipe(slug="omelette", title="Omelette", servings=1)
@yield(egg, 1:count)
@ingredient(1, egg, 2:count)
@step("Beat @1 and cook.")
`;

let tmpDir: string;
let foodDb: OpenedFoodDb;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-plan-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  createIngredient(foodDb.db, { name: 'Egg', slug: 'egg', defaultUnit: 'count' });
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('plan REST — slots', () => {
  it('adds, lists, updates and reports duplicate/unknown slots', async () => {
    const api = client();
    expect(await api.plan.addSlot('dinner', 'Dinner')).toEqual({ ok: true });
    expect((await api.plan.listSlots()).slots.map((s) => s.slug)).toContain('dinner');
    expect(await api.plan.addSlot('dinner', 'Dinner 2')).toEqual({
      ok: false,
      reason: 'SlugTaken',
    });
    expect(await api.plan.updateSlot('ghost', { name: 'X' })).toEqual({
      ok: false,
      reason: 'SlotNotFound',
    });
    expect(await api.plan.deleteSlot('ghost')).toEqual({ ok: false, reason: 'SlotNotFound' });
  });
});

describe('plan REST — entries', () => {
  it('adds a planned entry for a promoted recipe and shows it in the week view', async () => {
    const api = client();
    await api.plan.addSlot('dinner', 'Dinner');
    const created = await api.recipes.create(OMELETTE);
    const promoted = await api.recipes.promote(created.versionId);
    expect(promoted.ok).toBe(true);

    const added = await api.plan.addEntry({
      date: '2026-06-16',
      slot: 'dinner',
      recipeId: created.recipeId,
      plannedServings: 2,
    });
    expect(added.ok).toBe(true);

    const week = await api.plan.weekView('2026-06-15');
    expect(week.entries.some((e) => e.recipeId === created.recipeId)).toBe(true);

    if (added.ok) {
      expect(await api.plan.deleteEntry(added.id)).toEqual({ ok: true });
    }
  });

  it('reports NotFound adding an entry for an unknown recipe', async () => {
    const api = client();
    await api.plan.addSlot('dinner', 'Dinner');
    const res = await api.plan.addEntry({
      date: '2026-06-16',
      slot: 'dinner',
      recipeId: 999999,
      plannedServings: 1,
    });
    expect(res).toEqual({ ok: false, reason: 'NotFound' });
  });

  it('reports BadSlot for an unknown slot', async () => {
    const created = await client().recipes.create(OMELETTE);
    await client().recipes.promote(created.versionId);
    const res = await client().plan.addEntry({
      date: '2026-06-16',
      slot: 'nonexistent',
      recipeId: created.recipeId,
      plannedServings: 1,
    });
    expect(res).toEqual({ ok: false, reason: 'BadSlot' });
  });

  it('returns an empty week view envelope', async () => {
    const week = await client().plan.weekView('2026-06-15');
    expect(week.entries).toEqual([]);
    expect(Array.isArray(week.slots)).toBe(true);
  });
});
