/**
 * PRD-142 — integration tests for `food.recipes.prepareSendToList` +
 * `food.recipes.sendToList`.
 *
 * Spins up in-memory SQLite with the minimum migration set (food schema
 * for ingredients/recipes/lines + lists schema for the target tables),
 * exercises every AC group end-to-end through `appRouter.createCaller`:
 * aggregation, scale, unconverted handling, merge semantics, notes
 * append + truncation, target resolution + error mapping.
 */
import { type Database } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, setDb } from '../../../db.js';
import { setListsDb } from '../../../db/lists-handle.js';
import { createCaller } from '../../../shared/test-utils.js';
import { MAX_NOTES_LENGTH } from '../recipes/send-to-list/notes-helpers.js';
import {
  createSendToListTestDb,
  seedIngredient,
  seedNonShoppingList,
  seedPrepState,
  seedRecipe,
  seedRecipeLine,
  seedRecipeVersion,
  seedShoppingList,
  seedVariant,
} from './send-to-list-helpers.js';

let db: Database;
let caller: ReturnType<typeof createCaller>;

beforeEach(() => {
  db = createSendToListTestDb();
  setDb(db);
  setListsDb({ db: drizzle(db), raw: db });
  caller = createCaller(true);
});

afterEach(() => {
  closeDb();
  setListsDb(null);
});

interface BasicSeed {
  versionId: number;
  ingredientId: number;
}

function seedBasicRecipeWithLines(): BasicSeed {
  const recipeId = seedRecipe(db, 'roast-chicken');
  const versionId = seedRecipeVersion(db, { recipeId, title: 'Roast Chicken' });
  const chickenId = seedIngredient(db, 'chicken', 'chicken', 'g');
  seedRecipeLine(db, {
    recipeVersionId: versionId,
    position: 0,
    ingredientId: chickenId,
    originalQty: 1000,
    originalUnit: 'g',
    qtyG: 1000,
    canonicalUnit: 'g',
  });
  return { versionId, ingredientId: chickenId };
}

describe('food.recipes.prepareSendToList', () => {
  it('returns title + scaleFactor=1 default + a single canonical preview', async () => {
    const { versionId } = seedBasicRecipeWithLines();
    const out = await caller.food.recipes.prepareSendToList({ versionId });
    expect(out.recipeTitle).toBe('Roast Chicken');
    expect(out.scaleFactor).toBe(1);
    expect(out.canonicalItems).toHaveLength(1);
    expect(out.canonicalItems[0]).toMatchObject({
      label: '1000 g chicken',
      qty: 1000,
      unit: 'g',
      ingredientId: expect.any(Number),
    });
    expect(out.unconvertedItems).toEqual([]);
    expect(out.alreadySentToListIds).toEqual([]);
  });

  it('groups three lines with same (ingredient, variant, unit) into one canonical row', async () => {
    const recipeId = seedRecipe(db, 'flour-stew');
    const versionId = seedRecipeVersion(db, { recipeId, title: 'Flour Stew' });
    const flourId = seedIngredient(db, 'flour', 'flour', 'g');
    for (let i = 0; i < 3; i += 1) {
      seedRecipeLine(db, {
        recipeVersionId: versionId,
        position: i,
        ingredientId: flourId,
        originalQty: 100,
        originalUnit: 'g',
        qtyG: 100,
        canonicalUnit: 'g',
      });
    }
    const out = await caller.food.recipes.prepareSendToList({ versionId });
    expect(out.canonicalItems).toHaveLength(1);
    expect(out.canonicalItems[0]?.qty).toBe(300);
    expect(out.canonicalItems[0]?.sourceLineIds).toHaveLength(3);
  });

  it('drops prep_state from grouping key but collects distinct prep slugs in label + prepStateLabel', async () => {
    const recipeId = seedRecipe(db, 'onion-soup');
    const versionId = seedRecipeVersion(db, { recipeId, title: 'Onion Soup' });
    const onionId = seedIngredient(db, 'onion', 'onion', 'g');
    const dicedId = seedPrepState(db, 'diced', 'diced');
    const slicedId = seedPrepState(db, 'sliced', 'sliced');
    seedRecipeLine(db, {
      recipeVersionId: versionId,
      position: 0,
      ingredientId: onionId,
      prepStateId: dicedId,
      qtyG: 200,
      canonicalUnit: 'g',
    });
    seedRecipeLine(db, {
      recipeVersionId: versionId,
      position: 1,
      ingredientId: onionId,
      prepStateId: slicedId,
      qtyG: 100,
      canonicalUnit: 'g',
    });
    const out = await caller.food.recipes.prepareSendToList({ versionId });
    expect(out.canonicalItems).toHaveLength(1);
    expect(out.canonicalItems[0]?.qty).toBe(300);
    expect(out.canonicalItems[0]?.prepStateLabel).toBe('diced, sliced');
    expect(out.canonicalItems[0]?.label).toBe('300 g onion (diced, sliced)');
  });

  it('different variant for the same ingredient stays separate', async () => {
    const recipeId = seedRecipe(db, 'oil-blend');
    const versionId = seedRecipeVersion(db, { recipeId, title: 'Oil Blend' });
    const oilId = seedIngredient(db, 'oil', 'oil', 'ml');
    const oliveId = seedVariant({
      db,
      ingredientId: oilId,
      slug: 'olive',
      name: 'olive',
      defaultUnit: 'ml',
    });
    seedRecipeLine(db, {
      recipeVersionId: versionId,
      position: 0,
      ingredientId: oilId,
      qtyMl: 50,
      canonicalUnit: 'ml',
    });
    seedRecipeLine(db, {
      recipeVersionId: versionId,
      position: 1,
      ingredientId: oilId,
      variantId: oliveId,
      qtyMl: 100,
      canonicalUnit: 'ml',
    });
    const out = await caller.food.recipes.prepareSendToList({ versionId });
    expect(out.canonicalItems).toHaveLength(2);
  });

  it('unconverted lines (all qty fields null) appear in unconvertedItems with original qty + unit', async () => {
    const recipeId = seedRecipe(db, 'curry');
    const versionId = seedRecipeVersion(db, { recipeId, title: 'Curry' });
    const gheeId = seedIngredient(db, 'ghee', 'ghee', 'g');
    seedRecipeLine(db, {
      recipeVersionId: versionId,
      position: 0,
      ingredientId: gheeId,
      originalQty: 2,
      originalUnit: 'tbsp',
      canonicalUnit: 'g',
      // qty_g / qty_ml / qty_count all null → unconverted
    });
    const out = await caller.food.recipes.prepareSendToList({ versionId });
    expect(out.canonicalItems).toEqual([]);
    expect(out.unconvertedItems).toHaveLength(1);
    expect(out.unconvertedItems[0]?.label).toBe('2 tbsp ghee');
    expect(out.unconvertedItems[0]?.qty).toBe(2);
    expect(out.unconvertedItems[0]?.unit).toBe('tbsp');
  });

  it('scaleFactor multiplies the canonical qty', async () => {
    const { versionId } = seedBasicRecipeWithLines();
    const out = await caller.food.recipes.prepareSendToList({ versionId, scaleFactor: 4 });
    expect(out.scaleFactor).toBe(4);
    expect(out.canonicalItems[0]?.qty).toBe(4000);
    expect(out.canonicalItems[0]?.label).toBe('4000 g chicken');
  });

  it('alreadySentToListIds detects matching list_items.notes via case-insensitive LIKE', async () => {
    const { versionId } = seedBasicRecipeWithLines();
    const listAId = seedShoppingList(db, 'This week');
    const listBId = seedShoppingList(db, 'Backup');
    const recipeRefListId = seedNonShoppingList(db, 'Todo'); // non-shopping should NOT match
    db.prepare(
      "INSERT INTO list_items (list_id, label, qty, unit, ref_kind, notes) VALUES (?, 'chicken', 1000, 'g', 'free', ?)"
    ).run(listAId, 'Roast Chicken (diced)');
    db.prepare(
      "INSERT INTO list_items (list_id, label, qty, unit, ref_kind, notes) VALUES (?, 'oranges', 6, 'count', 'free', ?)"
    ).run(listBId, 'breakfast');
    db.prepare(
      "INSERT INTO list_items (list_id, label, ref_kind, notes) VALUES (?, 'task', 'free', 'Roast Chicken')"
    ).run(recipeRefListId);
    const out = await caller.food.recipes.prepareSendToList({ versionId });
    expect(out.alreadySentToListIds).toEqual([listAId]);
  });

  it('escapes % and _ in the recipe title for the LIKE query', async () => {
    const recipeId = seedRecipe(db, 'special-recipe');
    const versionId = seedRecipeVersion(db, { recipeId, title: '50% Off_Brand' });
    const ingId = seedIngredient(db, 'sugar', 'sugar', 'g');
    seedRecipeLine(db, {
      recipeVersionId: versionId,
      position: 0,
      ingredientId: ingId,
      qtyG: 10,
      canonicalUnit: 'g',
    });
    const listId = seedShoppingList(db, 'List A');
    const noiseId = seedShoppingList(db, 'List B');
    db.prepare(
      "INSERT INTO list_items (list_id, label, ref_kind, notes) VALUES (?, 'item', 'free', ?)"
    ).run(listId, '50% Off_Brand');
    // A list_items.notes that would match if '%'/'_' were treated as wildcards
    db.prepare(
      "INSERT INTO list_items (list_id, label, ref_kind, notes) VALUES (?, 'item', 'free', ?)"
    ).run(noiseId, '50ABCOffXBrand');
    const out = await caller.food.recipes.prepareSendToList({ versionId });
    expect(out.alreadySentToListIds).toEqual([listId]);
  });

  it('throws PRECONDITION_FAILED for an uncompiled version', async () => {
    const recipeId = seedRecipe(db, 'wip');
    const versionId = seedRecipeVersion(db, {
      recipeId,
      title: 'WIP',
      compileStatus: 'uncompiled',
    });
    await expect(caller.food.recipes.prepareSendToList({ versionId })).rejects.toThrow();
  });

  it('throws NOT_FOUND for an unknown version id', async () => {
    await expect(caller.food.recipes.prepareSendToList({ versionId: 9999 })).rejects.toThrow();
  });
});

describe('food.recipes.sendToList — fresh inserts', () => {
  it('creates a brand-new shopping list with kind=shopping + ownerApp=food', async () => {
    const { versionId } = seedBasicRecipeWithLines();
    const result = await caller.food.recipes.sendToList({
      versionId,
      target: { kind: 'new', name: 'Sunday groceries' },
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    const row = db
      .prepare('SELECT name, kind, owner_app FROM lists WHERE id = ?')
      .get(result.listId) as { name: string; kind: string; owner_app: string };
    expect(row).toEqual({ name: 'Sunday groceries', kind: 'shopping', owner_app: 'food' });
    expect(result.addedCount).toBe(1);
    expect(result.mergedCount).toBe(0);
    const items = db
      .prepare('SELECT label, qty, unit, ref_kind, ref_id, notes FROM list_items WHERE list_id = ?')
      .all(result.listId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      label: '1000 g chicken',
      qty: 1000,
      unit: 'g',
      ref_kind: 'ingredient',
      notes: 'Roast Chicken',
    });
  });

  it('inserts unconverted lines with ref_kind=free so they never merge with canonical sends', async () => {
    const recipeId = seedRecipe(db, 'sauce');
    const versionId = seedRecipeVersion(db, { recipeId, title: 'Sauce' });
    const gheeId = seedIngredient(db, 'ghee', 'ghee', 'g');
    seedRecipeLine(db, {
      recipeVersionId: versionId,
      position: 0,
      ingredientId: gheeId,
      originalQty: 2,
      originalUnit: 'tbsp',
      canonicalUnit: 'g',
    });
    const result = await caller.food.recipes.sendToList({
      versionId,
      target: { kind: 'new', name: 'Sauce shopping' },
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    const items = db
      .prepare('SELECT ref_kind, ref_id, label FROM list_items WHERE list_id = ?')
      .all(result.listId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ ref_kind: 'free', ref_id: null, label: '2 tbsp ghee' });
  });
});

describe('food.recipes.sendToList — merge into existing', () => {
  it('matches on (ref_kind, ref_id) and bumps qty + appends notes + regenerates label', async () => {
    const { versionId, ingredientId } = seedBasicRecipeWithLines();
    const listId = seedShoppingList(db, 'Weekly');
    db.prepare(
      "INSERT INTO list_items (list_id, label, qty, unit, ref_kind, ref_id, notes) VALUES (?, '500 g chicken', 500, 'g', 'ingredient', ?, 'Old Recipe')"
    ).run(listId, ingredientId);
    const result = await caller.food.recipes.sendToList({
      versionId,
      target: { kind: 'existing', listId },
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.mergedCount).toBe(1);
    expect(result.addedCount).toBe(0);
    const row = db
      .prepare('SELECT label, qty, unit, notes FROM list_items WHERE list_id = ?')
      .get(listId) as { label: string; qty: number; unit: string; notes: string };
    expect(row.qty).toBe(1500);
    expect(row.label).toBe('1500 g chicken');
    expect(row.notes).toBe('Old Recipe; Roast Chicken');
  });

  it('matches on (variant, refId=variantId) for canonical items with a variant', async () => {
    const recipeId = seedRecipe(db, 'oil-blend');
    const versionId = seedRecipeVersion(db, { recipeId, title: 'Oil Blend' });
    const oilId = seedIngredient(db, 'oil', 'oil', 'ml');
    const oliveId = seedVariant({
      db,
      ingredientId: oilId,
      slug: 'olive',
      name: 'olive',
      defaultUnit: 'ml',
    });
    seedRecipeLine(db, {
      recipeVersionId: versionId,
      position: 0,
      ingredientId: oilId,
      variantId: oliveId,
      qtyMl: 100,
      canonicalUnit: 'ml',
    });
    const listId = seedShoppingList(db, 'Pantry');
    db.prepare(
      "INSERT INTO list_items (list_id, label, qty, unit, ref_kind, ref_id) VALUES (?, '200 ml oil olive', 200, 'ml', 'variant', ?)"
    ).run(listId, oliveId);
    const result = await caller.food.recipes.sendToList({
      versionId,
      target: { kind: 'existing', listId },
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.mergedCount).toBe(1);
    const row = db.prepare('SELECT label, qty FROM list_items WHERE list_id = ?').get(listId) as {
      label: string;
      qty: number;
    };
    expect(row.qty).toBe(300);
    expect(row.label).toBe('300 ml oil olive');
  });

  it('truncates notes from the front with … when the merge would exceed 500 chars', async () => {
    const { versionId, ingredientId } = seedBasicRecipeWithLines();
    const listId = seedShoppingList(db, 'Big notes');
    const longNotes = `${'a'.repeat(490)}; OldEntry`;
    db.prepare(
      "INSERT INTO list_items (list_id, label, qty, unit, ref_kind, ref_id, notes) VALUES (?, '100 g chicken', 100, 'g', 'ingredient', ?, ?)"
    ).run(listId, ingredientId, longNotes);
    const result = await caller.food.recipes.sendToList({
      versionId,
      target: { kind: 'existing', listId },
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    const row = db.prepare('SELECT notes FROM list_items WHERE list_id = ?').get(listId) as {
      notes: string;
    };
    expect(row.notes.length).toBeLessThanOrEqual(MAX_NOTES_LENGTH);
    expect(row.notes.startsWith('…')).toBe(true);
    expect(row.notes.endsWith('Roast Chicken')).toBe(true);
  });
});

describe('food.recipes.sendToList — error mapping', () => {
  it('returns RecipeNotFound for unknown versionId', async () => {
    const result = await caller.food.recipes.sendToList({
      versionId: 9999,
      target: { kind: 'new', name: 'X' },
    });
    expect(result).toEqual({ ok: false, reason: 'RecipeNotFound' });
  });

  it('returns CompileNotReady for an uncompiled version', async () => {
    const recipeId = seedRecipe(db, 'wip');
    const versionId = seedRecipeVersion(db, {
      recipeId,
      title: 'WIP',
      compileStatus: 'uncompiled',
    });
    const result = await caller.food.recipes.sendToList({
      versionId,
      target: { kind: 'new', name: 'X' },
    });
    expect(result).toEqual({ ok: false, reason: 'CompileNotReady' });
  });

  it('returns NoIngredients when the recipe has zero lines', async () => {
    const recipeId = seedRecipe(db, 'empty');
    const versionId = seedRecipeVersion(db, { recipeId, title: 'Empty' });
    const result = await caller.food.recipes.sendToList({
      versionId,
      target: { kind: 'new', name: 'X' },
    });
    expect(result).toEqual({ ok: false, reason: 'NoIngredients' });
  });

  it('returns TargetListNotFound for unknown listId', async () => {
    const { versionId } = seedBasicRecipeWithLines();
    const result = await caller.food.recipes.sendToList({
      versionId,
      target: { kind: 'existing', listId: 9999 },
    });
    expect(result).toEqual({ ok: false, reason: 'TargetListNotFound' });
  });

  it('returns TargetListArchived for archived shopping list', async () => {
    const { versionId } = seedBasicRecipeWithLines();
    const listId = seedShoppingList(db, 'Old', 'food', true);
    const result = await caller.food.recipes.sendToList({
      versionId,
      target: { kind: 'existing', listId },
    });
    expect(result).toEqual({ ok: false, reason: 'TargetListArchived' });
  });

  it('returns TargetListNotShopping when picking a non-shopping list', async () => {
    const { versionId } = seedBasicRecipeWithLines();
    const listId = seedNonShoppingList(db, 'Tasks', 'todo');
    const result = await caller.food.recipes.sendToList({
      versionId,
      target: { kind: 'existing', listId },
    });
    expect(result).toEqual({ ok: false, reason: 'TargetListNotShopping' });
  });
});
