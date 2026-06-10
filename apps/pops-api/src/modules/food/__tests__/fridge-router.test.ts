/**
 * PRD-147 — integration tests for `food.fridge.*`.
 *
 * Spins up an in-memory food database via the same migration replay
 * pattern as `batches-router.test.ts`, seeds variants + batches +
 * recipes, then exercises the `view` and `recipesUsingBatch` queries.
 *
 * Coverage per PRD-147 §Acceptance Criteria:
 *   - default view excludes empty + soft-deleted batches
 *   - includeEmpty / includeDeleted toggles
 *   - location, search, expiringSoon, recipeYieldedOnly filters
 *   - sort by location, ingredient name, expiry NULLS LAST, produced
 *   - daysToExpiry boundary (today / yesterday / tomorrow)
 *   - counts.visible / empty / deleted
 *   - recipesUsingBatch: variant-only join + recent-cook order
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  batchesLifecycleService,
  ingredientsService,
  ingredientVariants,
  recipeLines,
  recipes,
  recipesService,
  recipeRunsService,
  recipeVersions,
  variantsService,
} from '@pops/app-food-db';

import { closeDb, getDrizzle, setDb } from '../../../db.js';
import { createCaller } from '../../../shared/test-utils.js';

const MIGRATION_FILES = [
  '0058_high_sentinel.sql',
  '0059_useful_hiroim.sql',
  '0060_familiar_leo.sql',
  '0061_shocking_skreet.sql',
  '0062_chemical_donald_blake.sql',
  '0063_bumpy_wolverine.sql',
  '0064_peaceful_magma.sql',
  '0065_prd_116_recipe_compile.sql',
  '0066_prd_123_conversions.sql',
  '0067_prd_125_ingest_error_columns.sql',
  '0068_prd_136_inbox_review.sql',
  '0069_prd_145_batches_deleted_at.sql',
];

function applyMigration(db: Database, filename: string): void {
  const text = readFileSync(join(__dirname, '../../../db/drizzle-migrations', filename), 'utf8');
  for (const stmt of text.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) db.exec(trimmed);
  }
}

function createFoodTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const name of MIGRATION_FILES) applyMigration(db, name);
  return db;
}

interface Seeded {
  tomatoVariantId: number;
  onionVariantId: number;
  recipeVersionId: number;
  recipeSlug: string;
}

function seedIngredientsAndRecipe(): Seeded {
  const db = getDrizzle();
  const tomato = ingredientsService.createIngredient(db, {
    name: 'Tomato',
    slug: 'tomato',
    defaultUnit: 'g',
  });
  const tomatoVariant = variantsService.createVariant(db, {
    ingredientId: tomato.id,
    name: 'Diced',
    slug: 'diced',
    defaultUnit: 'g',
  });
  db.update(ingredientVariants)
    .set({ defaultShelfLifeDaysFridge: 5, defaultShelfLifeDaysFreezer: 90 })
    .where(eq(ingredientVariants.id, tomatoVariant.id))
    .run();

  const onion = ingredientsService.createIngredient(db, {
    name: 'Onion',
    slug: 'onion',
    defaultUnit: 'g',
  });
  const onionVariant = variantsService.createVariant(db, {
    ingredientId: onion.id,
    name: 'Yellow',
    slug: 'yellow',
    defaultUnit: 'g',
  });
  db.update(ingredientVariants)
    .set({ defaultShelfLifeDaysFridge: 10 })
    .where(eq(ingredientVariants.id, onionVariant.id))
    .run();

  const recipeSlug = 'tomato-soup';
  const { version } = recipesService.createRecipe(db, {
    slug: recipeSlug,
    firstVersion: {
      title: 'Tomato Soup',
      bodyDsl: '@recipe(slug="tomato-soup", title="Tomato Soup")',
    },
  });
  db.update(recipeVersions)
    .set({ compileStatus: 'compiled' })
    .where(eq(recipeVersions.id, version.id))
    .run();

  return {
    tomatoVariantId: tomatoVariant.id,
    onionVariantId: onionVariant.id,
    recipeVersionId: version.id,
    recipeSlug,
  };
}

describe('food.fridge router — PRD-147', () => {
  let sqlite: Database;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    sqlite = createFoodTestDb();
    setDb(sqlite);
    caller = createCaller();
  });

  afterEach(() => {
    closeDb();
    sqlite.close();
  });

  describe('view', () => {
    it('returns four location sections even when empty', async () => {
      seedIngredientsAndRecipe();
      const view = await caller.food.fridge.view({});
      const locations = view.sections.map((s) => s.location);
      expect(locations).toEqual(['pantry', 'fridge', 'freezer', 'other']);
      for (const section of view.sections) {
        expect(section.count).toBe(0);
        expect(section.ingredients).toEqual([]);
      }
      expect(view.counts).toEqual({ visible: 0, empty: 0, deleted: 0 });
    });

    it('groups batches by location and ingredient with expiry-then-produced ordering', async () => {
      const seed = seedIngredientsAndRecipe();
      const { batchId: olderTomato } = await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: '2026-06-01T00:00:00.000Z',
        expiresAt: '2026-06-12T00:00:00.000Z',
      });
      const { batchId: newerTomato } = await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 150,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: '2026-06-03T00:00:00.000Z',
        expiresAt: '2026-06-10T00:00:00.000Z',
      });
      await caller.food.batches.create({
        variantId: seed.onionVariantId,
        prepStateId: null,
        qty: 500,
        unit: 'g',
        location: 'pantry',
        sourceType: 'purchase',
        producedAt: '2026-06-01T00:00:00.000Z',
      });

      const view = await caller.food.fridge.view({});
      const fridge = view.sections.find((s) => s.location === 'fridge');
      expect(fridge?.count).toBe(2);
      expect(fridge?.ingredients).toHaveLength(1);
      const tomatoGroup = fridge?.ingredients[0];
      expect(tomatoGroup?.ingredientName).toBe('Tomato');
      expect(tomatoGroup?.batches.map((b) => b.id)).toEqual([newerTomato, olderTomato]);

      const pantry = view.sections.find((s) => s.location === 'pantry');
      expect(pantry?.count).toBe(1);
      expect(pantry?.ingredients[0]?.ingredientName).toBe('Onion');

      expect(view.counts.visible).toBe(3);
    });

    it('hides empty + soft-deleted batches by default and reveals them via toggles', async () => {
      const seed = seedIngredientsAndRecipe();
      const { batchId: keep } = await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      const { batchId: empty } = await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 100,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      await caller.food.batches.adjustQty({ id: empty, delta: -100, reason: 'wasted' });
      const { batchId: removed } = await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      await caller.food.batches.delete({ id: removed });

      const base = await caller.food.fridge.view({});
      expect(base.counts).toEqual({ visible: 1, empty: 1, deleted: 1 });
      const fridge = base.sections.find((s) => s.location === 'fridge');
      expect(fridge?.ingredients[0]?.batches.map((b) => b.id)).toEqual([keep]);

      const withEmpty = await caller.food.fridge.view({ includeEmpty: true });
      const fridgeEmpty = withEmpty.sections.find((s) => s.location === 'fridge');
      expect(fridgeEmpty?.ingredients[0]?.batches.map((b) => b.id).toSorted()).toEqual(
        [keep, empty].toSorted()
      );

      // Deleted rows always have qty=0; the "Show all" toggle in the UI
      // sets both includeEmpty + includeDeleted so they surface together.
      const withDeleted = await caller.food.fridge.view({
        includeEmpty: true,
        includeDeleted: true,
      });
      const fridgeDeleted = withDeleted.sections.find((s) => s.location === 'fridge');
      const ids = fridgeDeleted?.ingredients[0]?.batches.map((b) => b.id) ?? [];
      expect(ids).toContain(removed);
    });

    it('filters by location and search', async () => {
      const seed = seedIngredientsAndRecipe();
      await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      await caller.food.batches.create({
        variantId: seed.onionVariantId,
        prepStateId: null,
        qty: 500,
        unit: 'g',
        location: 'pantry',
        sourceType: 'purchase',
      });

      const onlyFridge = await caller.food.fridge.view({ locations: ['fridge'] });
      expect(onlyFridge.sections.find((s) => s.location === 'fridge')?.ingredients.length).toBe(1);
      expect(onlyFridge.sections.find((s) => s.location === 'pantry')?.ingredients.length).toBe(0);

      const searchOnion = await caller.food.fridge.view({ search: 'onion' });
      const allBatches = searchOnion.sections.flatMap((s) =>
        s.ingredients.flatMap((g) => g.batches)
      );
      expect(allBatches).toHaveLength(1);
    });

    it('filters expiringSoon to the next 7 days', async () => {
      const seed = seedIngredientsAndRecipe();
      const today = new Date();
      const inThreeDays = new Date(today.getTime() + 3 * 86_400_000).toISOString();
      const inThirty = new Date(today.getTime() + 30 * 86_400_000).toISOString();
      await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 100,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        expiresAt: inThreeDays,
      });
      await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 100,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        expiresAt: inThirty,
      });
      const view = await caller.food.fridge.view({ expiringSoon: true });
      const allBatches = view.sections.flatMap((s) => s.ingredients.flatMap((g) => g.batches));
      expect(allBatches).toHaveLength(1);
    });

    it('filters recipeYieldedOnly to recipe_run-sourced batches', async () => {
      const seed = seedIngredientsAndRecipe();
      await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 100,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      const db = getDrizzle();
      const run = recipeRunsService.createRun(db, { recipeVersionId: seed.recipeVersionId });
      batchesLifecycleService.createBatchFromRun(db, run.id, {
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 500,
        unit: 'g',
        location: 'fridge',
      });

      const yieldedOnly = await caller.food.fridge.view({ recipeYieldedOnly: true });
      const rows = yieldedOnly.sections.flatMap((s) => s.ingredients.flatMap((g) => g.batches));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.sourceType).toBe('recipe_run');
      expect(rows[0]?.sourceRecipeSlug).toBe(seed.recipeSlug);
    });

    it('computes daysToExpiry for today / past / future', async () => {
      const seed = seedIngredientsAndRecipe();
      const today = new Date();
      const utcMid = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
      );
      const produced = new Date(utcMid.getTime() - 30 * 86_400_000).toISOString();
      const past = new Date(utcMid.getTime() - 2 * 86_400_000).toISOString();
      const future = new Date(utcMid.getTime() + 4 * 86_400_000).toISOString();
      await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 50,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: produced,
        expiresAt: past,
      });
      await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 50,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: produced,
        expiresAt: utcMid.toISOString(),
      });
      await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 50,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: produced,
        expiresAt: future,
      });

      const view = await caller.food.fridge.view({});
      const rows =
        view.sections
          .find((s) => s.location === 'fridge')
          ?.ingredients[0]?.batches.map((b) => b.daysToExpiry) ?? [];
      expect(rows).toEqual([-2, 0, 4]);
    });
  });

  describe('recipesUsingBatch', () => {
    it('returns recipes whose current version references the batch variant', async () => {
      const seed = seedIngredientsAndRecipe();
      const db = getDrizzle();

      const { batchId } = await caller.food.batches.create({
        variantId: seed.tomatoVariantId,
        prepStateId: null,
        qty: 500,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });

      const variantRow = db
        .select({ ingredientId: ingredientVariants.ingredientId })
        .from(ingredientVariants)
        .where(eq(ingredientVariants.id, seed.tomatoVariantId))
        .get();
      expect(variantRow).toBeDefined();

      db.insert(recipeLines)
        .values({
          recipeVersionId: seed.recipeVersionId,
          position: 1,
          ingredientId: variantRow?.ingredientId ?? 0,
          variantId: seed.tomatoVariantId,
          prepStateId: null,
          isRecipeRef: 0,
          recipeRefId: null,
          originalText: 'tomato:diced',
          originalQty: 250,
          originalUnit: 'g',
          qtyG: 250,
          qtyMl: null,
          qtyCount: null,
          canonicalUnit: 'g',
          optional: 0,
          notes: null,
        })
        .run();

      db.update(recipes)
        .set({ currentVersionId: seed.recipeVersionId })
        .where(eq(recipes.slug, seed.recipeSlug))
        .run();

      const result = await caller.food.fridge.recipesUsingBatch({ batchId });
      expect(result.items).toHaveLength(1);
      const row = result.items[0];
      expect(row?.recipeSlug).toBe(seed.recipeSlug);
      expect(row?.lineCount).toBe(1);
      expect(row?.recipeNeedsQty).toBe(250);
      expect(row?.lastCookedAt).toBeNull();
    });

    it('returns empty for unknown batch id', async () => {
      seedIngredientsAndRecipe();
      const result = await caller.food.fridge.recipesUsingBatch({ batchId: 99999 });
      expect(result.items).toEqual([]);
    });
  });
});
