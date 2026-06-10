/**
 * PRD-146 — integration tests for `food.batches.searchForConsume`.
 *
 * Mirrors the `batches-router.test.ts` fixture pattern (in-memory
 * SQLite, full PRD-145 migration set) and exercises the PRD-146 spec
 * for the picker query:
 *
 *  - FIFO order (`expires_at ASC NULLS LAST, produced_at ASC`)
 *  - filters: ingredient, variant, location, qtyGreaterThan
 *  - exclusions: soft-deleted, empty (qty_remaining <= qtyGreaterThan)
 *  - limit
 *  - joined row shape (`BatchForConsumeRow`)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  batchesLifecycleService,
  ingredientsService,
  prepStatesService,
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

interface SeedIds {
  ingredientId: number;
  variantA: number;
  variantB: number;
  prepStateId: number;
}

function seedTwoVariants(slug: string): SeedIds {
  const db = getDrizzle();
  const ing = ingredientsService.createIngredient(db, {
    name: 'Tomato',
    slug: `${slug}-tomato`,
    defaultUnit: 'g',
  });
  const a = variantsService.createVariant(db, {
    ingredientId: ing.id,
    name: 'Diced',
    slug: 'diced',
    defaultUnit: 'g',
  });
  const b = variantsService.createVariant(db, {
    ingredientId: ing.id,
    name: 'Whole',
    slug: 'whole',
    defaultUnit: 'g',
  });
  const prep = prepStatesService.createPrepState(db, {
    slug: `${slug}-cooked`,
    name: 'Cooked',
  });
  return { ingredientId: ing.id, variantA: a.id, variantB: b.id, prepStateId: prep.id };
}

interface BatchSeed {
  variantId: number;
  prepStateId?: number | null;
  qty: number;
  location: 'pantry' | 'fridge' | 'freezer' | 'other';
  producedAt: string;
  expiresAt?: string | null;
}

function createBatch(seed: BatchSeed): number {
  const result = batchesLifecycleService.createBatchManual(getDrizzle(), {
    variantId: seed.variantId,
    prepStateId: seed.prepStateId ?? null,
    qty: seed.qty,
    unit: 'g',
    location: seed.location,
    sourceType: 'purchase',
    producedAt: seed.producedAt,
    expiresAt: seed.expiresAt ?? undefined,
  });
  if (!result.ok) throw new Error(`seed createBatchManual failed: ${result.reason}`);
  return result.batchId;
}

describe('food.batches.searchForConsume — PRD-146', () => {
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

  it('orders by expires_at ASC NULLS LAST, produced_at ASC', async () => {
    const { variantA } = seedTwoVariants('order');
    const earliestExpiry = createBatch({
      variantId: variantA,
      qty: 100,
      location: 'fridge',
      producedAt: '2026-06-05T00:00:00.000Z',
      expiresAt: '2026-06-08T00:00:00.000Z',
    });
    const laterExpiry = createBatch({
      variantId: variantA,
      qty: 100,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-15T00:00:00.000Z',
    });
    const nullExpiryOlder = createBatch({
      variantId: variantA,
      qty: 100,
      location: 'pantry',
      producedAt: '2026-05-20T00:00:00.000Z',
      expiresAt: null,
    });
    const nullExpiryNewer = createBatch({
      variantId: variantA,
      qty: 100,
      location: 'pantry',
      producedAt: '2026-06-02T00:00:00.000Z',
      expiresAt: null,
    });

    const { items } = await caller.food.batches.searchForConsume({ variantId: variantA });
    expect(items.map((b) => b.id)).toEqual([
      earliestExpiry,
      laterExpiry,
      nullExpiryOlder,
      nullExpiryNewer,
    ]);
  });

  it('excludes soft-deleted batches', async () => {
    const { variantA } = seedTwoVariants('deleted');
    const keep = createBatch({
      variantId: variantA,
      qty: 100,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-10T00:00:00.000Z',
    });
    const drop = createBatch({
      variantId: variantA,
      qty: 100,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-05T00:00:00.000Z',
    });
    batchesLifecycleService.deleteBatch(getDrizzle(), drop);

    const { items } = await caller.food.batches.searchForConsume({ variantId: variantA });
    expect(items.map((b) => b.id)).toEqual([keep]);
  });

  it('excludes empty batches (qty_remaining <= qtyGreaterThan, default 0)', async () => {
    const { variantA } = seedTwoVariants('empty');
    const full = createBatch({
      variantId: variantA,
      qty: 500,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-10T00:00:00.000Z',
    });
    const empty = createBatch({
      variantId: variantA,
      qty: 0,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-08T00:00:00.000Z',
    });
    void empty;

    const { items } = await caller.food.batches.searchForConsume({ variantId: variantA });
    expect(items.map((b) => b.id)).toEqual([full]);
  });

  it('applies a qtyGreaterThan floor', async () => {
    const { variantA } = seedTwoVariants('floor');
    const big = createBatch({
      variantId: variantA,
      qty: 300,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-15T00:00:00.000Z',
    });
    const small = createBatch({
      variantId: variantA,
      qty: 50,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-10T00:00:00.000Z',
    });
    void small;

    const { items } = await caller.food.batches.searchForConsume({
      variantId: variantA,
      qtyGreaterThan: 100,
    });
    expect(items.map((b) => b.id)).toEqual([big]);
  });

  it('filters by variantId (takes precedence over ingredientId)', async () => {
    const { ingredientId, variantA, variantB } = seedTwoVariants('variant-filter');
    const aBatch = createBatch({
      variantId: variantA,
      qty: 100,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-08T00:00:00.000Z',
    });
    const bBatch = createBatch({
      variantId: variantB,
      qty: 100,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-05T00:00:00.000Z',
    });
    void bBatch;

    const { items } = await caller.food.batches.searchForConsume({
      ingredientId,
      variantId: variantA,
    });
    expect(items.map((b) => b.id)).toEqual([aBatch]);
  });

  it('filters by ingredientId (returns both variants of the same ingredient)', async () => {
    const { ingredientId, variantA, variantB } = seedTwoVariants('ingredient-filter');
    const aBatch = createBatch({
      variantId: variantA,
      qty: 100,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-08T00:00:00.000Z',
    });
    const bBatch = createBatch({
      variantId: variantB,
      qty: 100,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-05T00:00:00.000Z',
    });

    const { items } = await caller.food.batches.searchForConsume({ ingredientId });
    expect(items.map((b) => b.id)).toEqual([bBatch, aBatch]);
  });

  it('filters by location', async () => {
    const { variantA } = seedTwoVariants('location');
    const fridge = createBatch({
      variantId: variantA,
      qty: 100,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-10T00:00:00.000Z',
    });
    const freezer = createBatch({
      variantId: variantA,
      qty: 100,
      location: 'freezer',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-15T00:00:00.000Z',
    });
    void freezer;

    const { items } = await caller.food.batches.searchForConsume({
      variantId: variantA,
      location: 'fridge',
    });
    expect(items.map((b) => b.id)).toEqual([fridge]);
  });

  it('applies the requested limit', async () => {
    const { variantA } = seedTwoVariants('limit');
    for (let i = 0; i < 5; i += 1) {
      createBatch({
        variantId: variantA,
        qty: 100,
        location: 'fridge',
        producedAt: `2026-06-0${i + 1}T00:00:00.000Z`,
        expiresAt: `2026-06-1${i + 1}T00:00:00.000Z`,
      });
    }

    const { items } = await caller.food.batches.searchForConsume({ variantId: variantA, limit: 2 });
    expect(items).toHaveLength(2);
  });

  it('returns the joined row shape', async () => {
    const { ingredientId, variantA, prepStateId } = seedTwoVariants('shape');
    createBatch({
      variantId: variantA,
      prepStateId,
      qty: 200,
      location: 'fridge',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-10T00:00:00.000Z',
    });

    const { items } = await caller.food.batches.searchForConsume({ variantId: variantA });
    expect(items[0]).toEqual({
      id: expect.any(Number),
      variantId: variantA,
      variantName: 'Diced',
      variantSlug: 'diced',
      ingredientId,
      ingredientName: 'Tomato',
      prepStateId,
      prepStateLabel: 'Cooked',
      qtyRemaining: 200,
      unit: 'g',
      location: 'fridge',
      expiresAt: '2026-06-10T00:00:00.000Z',
      producedAt: '2026-06-01T00:00:00.000Z',
    });
  });
});
