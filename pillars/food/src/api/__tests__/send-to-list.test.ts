/**
 * Integration tests for the send-to-list REST surface, which writes to the
 * lists pillar over HTTP. A stub `ListsClient` is injected via
 * `deps.listsClient`, recording the cross-pillar calls so the flow is
 * exercised end-to-end without a live lists-api. Aggregation maths live in
 * the db-layer tests; here we assert the wire envelopes + target handling.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createIngredient } from '../../db/services/ingredients.js';
import { createFoodApiApp } from '../app.js';
import {
  type ListHeader,
  type ListsClient,
  type UpsertByRefBody,
} from '../modules/recipes/send-to-list/lists-client.js';
import { makeClient } from './test-utils.js';

const DSL = `@recipe(slug="grilled-cheese", title="Grilled Cheese", servings=1)
@yield(bread, 1:count)
@ingredient(1, bread, 2:count)
@ingredient(2, butter, 10:g)
@ingredient(3, cheddar, 60:g)
@step("Assemble @1 @2 @3 and grill.")
`;

interface StubState {
  created: { name: string }[];
  upserts: { listId: number; body: UpsertByRefBody }[];
  lists: Map<number, ListHeader>;
}

function makeStubClient(state: StubState): ListsClient {
  let nextId = 100;
  return {
    getList: (id) => Promise.resolve(state.lists.get(id) ?? null),
    createShoppingList: (name) => {
      state.created.push({ name });
      const id = (nextId += 1);
      state.lists.set(id, { id, kind: 'shopping', ownerApp: 'food', archivedAt: null });
      return Promise.resolve(id);
    },
    upsertByRef: (listId, body) => {
      state.upserts.push({ listId, body });
      return Promise.resolve({ outcome: 'inserted' as const, itemId: state.upserts.length });
    },
    addItem: () => Promise.resolve(),
    searchShoppingListIdsByNotes: () => Promise.resolve([]),
  };
}

let tmpDir: string;
let foodDb: OpenedFoodDb;
let state: StubState;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({
      foodDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3005',
      listsClient: makeStubClient(state),
    })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-send-to-list-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  state = { created: [], upserts: [], lists: new Map() };
  createIngredient(foodDb.db, { name: 'Bread', slug: 'bread', defaultUnit: 'count' });
  createIngredient(foodDb.db, { name: 'Butter', slug: 'butter', defaultUnit: 'g' });
  createIngredient(foodDb.db, { name: 'Cheddar', slug: 'cheddar', defaultUnit: 'g' });
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('send-to-list REST', () => {
  it('previews a compiled version and sends to a new shopping list via REST', async () => {
    const api = client();
    const created = await api.recipes.create(DSL);

    const preview = await api.sendToList.prepare(created.versionId);
    expect(preview.recipeTitle).toBe('Grilled Cheese');
    expect(preview.canonicalItems.length).toBeGreaterThan(0);

    const res = await api.sendToList.send(created.versionId, { kind: 'new', name: 'Groceries' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.addedCount).toBeGreaterThan(0);
      expect(state.created).toEqual([{ name: 'Groceries' }]);
      expect(state.upserts.length).toBe(res.addedCount);
      expect(state.upserts[0]?.body.onConflict).toBe('merge-additive');
    }
  });

  it('rejects a non-shopping existing target', async () => {
    state.lists.set(7, { id: 7, kind: 'todo', ownerApp: 'x', archivedAt: null });
    const api = client();
    const created = await api.recipes.create(DSL);
    const res = await api.sendToList.send(created.versionId, { kind: 'existing', listId: 7 });
    expect(res).toEqual({ ok: false, reason: 'TargetListNotShopping' });
  });

  it('404s prepare for an unknown version', async () => {
    await expect(client().sendToList.prepare(999999)).rejects.toMatchObject({ status: 404 });
  });
});
