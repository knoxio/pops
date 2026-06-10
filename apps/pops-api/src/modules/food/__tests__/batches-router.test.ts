/**
 * PRD-145 — integration tests for `food.batches.*`.
 *
 * Mirrors the service-layer Vitest suite (`batches-lifecycle.test.ts`)
 * at the tRPC boundary so any router-level breakage (input parsing,
 * error shape, mutation routing) surfaces here.
 *
 * Coverage per PRD-145 §Acceptance Criteria:
 *   - food.batches.create — manual entry happy path + BadExpiry + default
 *     expiry from variant shelf-life
 *   - food.batches.get — joined BatchDetail; null for missing
 *   - food.batches.relocate — auto-default recompute + user-override preserve
 *   - food.batches.edit — CannotEditFromRun on cook-yielded batches +
 *     BadExpiry guard + null clears
 *   - food.batches.adjustQty — every reason path + BadAdjustment + NegativeQty
 *   - food.batches.delete — soft-delete invariant + idempotent rejection
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  batchesLifecycleService,
  batches,
  ingredientsService,
  ingredientVariants,
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

interface SeedResult {
  ingredientId: number;
  variantId: number;
  recipeVersionId: number;
}

function seedVariantAndRecipe(slug: string): SeedResult {
  const db = getDrizzle();
  const ing = ingredientsService.createIngredient(db, {
    name: 'Tomato',
    slug: `${slug}-tomato`,
    defaultUnit: 'g',
  });
  const variant = variantsService.createVariant(db, {
    ingredientId: ing.id,
    name: 'Diced',
    slug: 'diced',
    defaultUnit: 'g',
  });
  db.update(ingredientVariants)
    .set({ defaultShelfLifeDaysFridge: 5, defaultShelfLifeDaysFreezer: 90 })
    .where(eq(ingredientVariants.id, variant.id))
    .run();
  const { recipe, version } = recipesService.createRecipe(db, {
    slug,
    firstVersion: { title: `Test ${slug}`, bodyDsl: `@recipe(slug="${slug}", title="Test")` },
  });
  void recipe;
  db.update(recipeVersions)
    .set({ compileStatus: 'compiled' })
    .where(eq(recipeVersions.id, version.id))
    .run();
  return { ingredientId: ing.id, variantId: variant.id, recipeVersionId: version.id };
}

describe('food.batches router — PRD-145', () => {
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

  describe('create', () => {
    it('inserts a manual batch with explicit expiresAt', async () => {
      const { variantId } = seedVariantAndRecipe('create-happy');
      const result = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 500,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: '2026-06-01T00:00:00.000Z',
        expiresAt: '2026-06-10T00:00:00.000Z',
      });
      expect(result.batchId).toBeGreaterThan(0);
    });

    it('defaults expiresAt from variant shelf-life days', async () => {
      const { variantId } = seedVariantAndRecipe('create-default');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: '2026-06-01T00:00:00.000Z',
      });
      const detail = await caller.food.batches.get({ id: batchId });
      expect(detail?.expiresAt).toBe('2026-06-06T00:00:00.000Z');
    });

    it('throws BAD_REQUEST when expiresAt precedes producedAt', async () => {
      const { variantId } = seedVariantAndRecipe('create-badexpiry');
      await expect(
        caller.food.batches.create({
          variantId,
          prepStateId: null,
          qty: 200,
          unit: 'g',
          location: 'fridge',
          sourceType: 'purchase',
          producedAt: '2026-06-10T00:00:00.000Z',
          expiresAt: '2026-06-01T00:00:00.000Z',
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('get', () => {
    it('returns the joined BatchDetail for an existing batch', async () => {
      const { variantId, ingredientId } = seedVariantAndRecipe('get-happy');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      const detail = await caller.food.batches.get({ id: batchId });
      expect(detail).toMatchObject({
        id: batchId,
        variantId,
        variantName: 'Diced',
        variantSlug: 'diced',
        ingredientId,
        ingredientName: 'Tomato',
        sourceType: 'purchase',
        sourceRecipeRunId: null,
        sourceRecipeSlug: null,
        deletedAt: null,
      });
    });

    it('returns null for a missing id', async () => {
      const detail = await caller.food.batches.get({ id: 99999 });
      expect(detail).toBeNull();
    });

    it('resolves sourceRecipeSlug for a cook-yielded batch', async () => {
      const seed = seedVariantAndRecipe('get-cook');
      const db = getDrizzle();
      const run = recipeRunsService.createRun(db, { recipeVersionId: seed.recipeVersionId });
      const yielded = batchesLifecycleService.createBatchFromRun(db, run.id, {
        variantId: seed.variantId,
        prepStateId: null,
        qty: 800,
        unit: 'g',
        location: 'fridge',
      });
      expect(yielded.batchId).not.toBeNull();
      const detail = await caller.food.batches.get({ id: yielded.batchId ?? -1 });
      expect(detail?.sourceType).toBe('recipe_run');
      expect(detail?.sourceRecipeRunId).toBe(run.id);
      expect(detail?.sourceRecipeSlug).toBe('get-cook');
    });
  });

  describe('relocate', () => {
    it('recomputes auto-default expiry on relocate', async () => {
      const { variantId } = seedVariantAndRecipe('relocate-auto');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: '2026-06-01T00:00:00.000Z',
      });
      const result = await caller.food.batches.relocate({ id: batchId, location: 'freezer' });
      expect(result).toEqual({ ok: true });
      const detail = await caller.food.batches.get({ id: batchId });
      expect(detail?.location).toBe('freezer');
      expect(detail?.expiresAt).toBe('2026-08-30T00:00:00.000Z');
    });

    it('preserves user-overridden expiry on relocate', async () => {
      const { variantId } = seedVariantAndRecipe('relocate-override');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: '2026-06-01T00:00:00.000Z',
        expiresAt: '2026-06-15T00:00:00.000Z',
      });
      await caller.food.batches.relocate({ id: batchId, location: 'freezer' });
      const detail = await caller.food.batches.get({ id: batchId });
      expect(detail?.expiresAt).toBe('2026-06-15T00:00:00.000Z');
    });

    it('returns BatchDeleted when relocating a soft-deleted batch', async () => {
      const { variantId } = seedVariantAndRecipe('relocate-deleted');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      await caller.food.batches.delete({ id: batchId });
      const result = await caller.food.batches.relocate({ id: batchId, location: 'freezer' });
      expect(result).toEqual({ ok: false, reason: 'BatchDeleted' });
    });
  });

  describe('edit', () => {
    it('rejects CannotEditFromRun for prepStateId edits on cook-yielded batches', async () => {
      const seed = seedVariantAndRecipe('edit-cook');
      const db = getDrizzle();
      const run = recipeRunsService.createRun(db, { recipeVersionId: seed.recipeVersionId });
      const yielded = batchesLifecycleService.createBatchFromRun(db, run.id, {
        variantId: seed.variantId,
        prepStateId: null,
        qty: 500,
        unit: 'g',
        location: 'fridge',
      });
      const result = await caller.food.batches.edit({
        id: yielded.batchId ?? -1,
        prepStateId: null,
      });
      expect(result).toEqual({ ok: false, reason: 'CannotEditFromRun' });
    });

    it('rejects BadExpiry when patch expiry precedes producedAt', async () => {
      const { variantId } = seedVariantAndRecipe('edit-badexpiry');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: '2026-06-05T00:00:00.000Z',
      });
      const result = await caller.food.batches.edit({
        id: batchId,
        expiresAt: '2026-06-01T00:00:00.000Z',
      });
      expect(result).toEqual({ ok: false, reason: 'BadExpiry' });
    });

    it('allows clearing expiresAt to null', async () => {
      const { variantId } = seedVariantAndRecipe('edit-clear');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 200,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
        producedAt: '2026-06-05T00:00:00.000Z',
      });
      const result = await caller.food.batches.edit({ id: batchId, expiresAt: null });
      expect(result).toEqual({ ok: true });
      const detail = await caller.food.batches.get({ id: batchId });
      expect(detail?.expiresAt).toBeNull();
    });
  });

  describe('adjustQty', () => {
    it('decrements with spoiled + negative delta', async () => {
      const { variantId } = seedVariantAndRecipe('adjust-spoiled');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 500,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      const result = await caller.food.batches.adjustQty({
        id: batchId,
        delta: -200,
        reason: 'spoiled',
      });
      expect(result).toEqual({ ok: true, newQty: 300 });
    });

    it('rejects BadAdjustment for positive delta with reason=spoiled', async () => {
      const { variantId } = seedVariantAndRecipe('adjust-badadj');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 500,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      const result = await caller.food.batches.adjustQty({
        id: batchId,
        delta: 50,
        reason: 'spoiled',
      });
      expect(result).toEqual({ ok: false, reason: 'BadAdjustment' });
    });

    it('accepts positive correction', async () => {
      const { variantId } = seedVariantAndRecipe('adjust-correct');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 500,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      const result = await caller.food.batches.adjustQty({
        id: batchId,
        delta: 50,
        reason: 'correction',
      });
      expect(result).toEqual({ ok: true, newQty: 550 });
    });

    it('rejects NegativeQty when delta would push below zero', async () => {
      const { variantId } = seedVariantAndRecipe('adjust-neg');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 100,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      const result = await caller.food.batches.adjustQty({
        id: batchId,
        delta: -200,
        reason: 'wasted',
      });
      expect(result).toEqual({ ok: false, reason: 'NegativeQty' });
    });
  });

  describe('delete', () => {
    it('soft-deletes with qty_remaining=0 + deleted_at set', async () => {
      const { variantId } = seedVariantAndRecipe('delete-happy');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 250,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      const result = await caller.food.batches.delete({ id: batchId });
      expect(result).toEqual({ ok: true });
      const db = getDrizzle();
      const row = db.select().from(batches).where(eq(batches.id, batchId)).get();
      expect(row?.qtyRemaining).toBe(0);
      expect(row?.deletedAt).not.toBeNull();
    });

    it('rejects BatchDeleted on second delete', async () => {
      const { variantId } = seedVariantAndRecipe('delete-idempotent');
      const { batchId } = await caller.food.batches.create({
        variantId,
        prepStateId: null,
        qty: 100,
        unit: 'g',
        location: 'fridge',
        sourceType: 'purchase',
      });
      await caller.food.batches.delete({ id: batchId });
      const result = await caller.food.batches.delete({ id: batchId });
      expect(result).toEqual({ ok: false, reason: 'BatchDeleted' });
    });
  });

  describe('searchForConsume (PRD-146)', () => {
    it('returns an empty list when no batches match', async () => {
      const { items } = await caller.food.batches.searchForConsume({ variantId: 9_999_999 });
      expect(items).toEqual([]);
    });
  });
});
