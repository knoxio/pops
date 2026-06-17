/**
 * Integration tests for the `shopping.*` REST surface (PRD-152). Builds a
 * plan fixture via the recipes/plan REST, previews the buy-list, and
 * generates it to a stub lists client. Aggregation/pantry maths live in the
 * db tests; here we assert the wire envelopes + the cross-pillar write.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createIngredient } from '../../db/services/ingredients.js';
import { createFoodApiApp } from '../app.js';
import { type ListsClient } from '../modules/recipes/send-to-list/lists-client.js';
import { makeClient } from './test-utils.js';

const OMELETTE = `@recipe(slug="omelette", title="Omelette", servings=1)
@yield(egg, 1:count)
@ingredient(1, egg, 2:count)
@step("Beat @1 and cook.")
`;

interface Stub {
  created: string[];
  items: number;
}

function stubClient(state: Stub): ListsClient {
  return {
    getList: () => Promise.resolve(null),
    createShoppingList: (name) => {
      state.created.push(name);
      return Promise.resolve(42);
    },
    upsertByRef: () => Promise.resolve({ outcome: 'inserted' as const, itemId: 1 }),
    addItem: () => {
      state.items += 1;
      return Promise.resolve();
    },
    searchShoppingListIdsByNotes: () => Promise.resolve([]),
  };
}

let tmpDir: string;
let foodDb: OpenedFoodDb;
let state: Stub;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({
      foodDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3005',
      listsClient: stubClient(state),
    })
  );
}

async function seedPlannedRecipe(api: ReturnType<typeof makeClient>): Promise<void> {
  await api.plan.addSlot('dinner', 'Dinner');
  const created = await api.recipes.create(OMELETTE);
  await api.recipes.promote(created.versionId);
  await api.plan.addEntry({
    date: '2026-06-16',
    slot: 'dinner',
    recipeId: created.recipeId,
    plannedServings: 2,
  });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-shopping-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  state = { created: [], items: 0 };
  createIngredient(foodDb.db, { name: 'Egg', slug: 'egg', defaultUnit: 'count' });
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('shopping REST', () => {
  it('previews a buy-list from a planned recipe', async () => {
    const api = client();
    await seedPlannedRecipe(api);

    const preview = await api.shopping.preview('2026-06-15', '2026-06-21');
    expect(preview.planEntryCount).toBe(1);
    const allItems = preview.sections.flatMap((s) => s.items);
    expect(allItems.length).toBeGreaterThan(0);
    expect(preview.recipeTitles).toContain('Omelette');
  });

  it('generates a list to the lists pillar via the client', async () => {
    const api = client();
    await seedPlannedRecipe(api);

    const res = await api.shopping.generate('2026-06-15', '2026-06-21', 'Week Groceries');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.listId).toBe(42);
      expect(res.itemCount).toBeGreaterThan(0);
      expect(state.created).toEqual(['Week Groceries']);
      expect(state.items).toBe(res.itemCount);
    }
  });

  it('rejects an empty list name and an empty plan range', async () => {
    const api = client();
    await seedPlannedRecipe(api);
    expect(await api.shopping.generate('2026-06-15', '2026-06-21', '   ')).toEqual({
      ok: false,
      reason: 'ListNameEmpty',
    });
    // A range with no plan entries → nothing to buy.
    expect(await api.shopping.generate('2025-01-06', '2025-01-12', 'Empty')).toEqual({
      ok: false,
      reason: 'NoPlanEntries',
    });
  });

  it('400s an invalid date range', async () => {
    await expect(client().shopping.preview('2026-06-21', '2026-06-15')).rejects.toMatchObject({
      status: 400,
    });
  });
});
