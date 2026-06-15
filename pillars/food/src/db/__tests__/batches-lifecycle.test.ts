/**
 * PRD-145 — batch lifecycle integration tests.
 *
 * Covers every service entry point + every error branch + the
 * service-enforced `deleted_at IS NOT NULL → qty_remaining = 0`
 * invariant (final `afterAll` scan).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { batches, ingredientVariants, recipeVersions } from '../schema.js';
import {
  adjustBatchQty,
  countDeletedInvariantViolations,
  createBatchFromRun,
  createBatchManual,
  deleteBatch,
  editBatch,
  relocateBatch,
} from '../services/batches-lifecycle.js';
import { consumeForRun } from '../services/batches.js';
import { createIngredient } from '../services/ingredients.js';
import { type FoodDb } from '../services/internal.js';
import { createRun } from '../services/recipe-runs.js';
import { createRecipe } from '../services/recipes.js';
import { createVariant } from '../services/variants.js';

const MIGRATIONS = [
  '0058_high_sentinel.sql',
  '0059_useful_hiroim.sql',
  '0060_familiar_leo.sql',
  '0069_prd_145_batches_deleted_at.sql',
].map((name) =>
  readFileSync(
    join(__dirname, '../../../../../apps/pops-api/src/db/drizzle-migrations', name),
    'utf8'
  )
);

let lastDb: FoodDb | null = null;

function freshDb(): FoodDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    const stmts = migration.split('--> statement-breakpoint');
    for (const stmt of stmts) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) raw.exec(trimmed);
    }
  }
  const db = drizzle(raw);
  lastDb = db;
  return db;
}

interface SeedResult {
  variantId: number;
  recipeVersionId: number;
}

function seedFridgeFreezerVariant(
  db: FoodDb,
  shelfLife: { fridge: number | null; freezer: number | null } = { fridge: 5, freezer: 90 }
): SeedResult {
  const ing = createIngredient(db, { name: 'Tomato', slug: 'tomato', defaultUnit: 'g' });
  const variant = createVariant(db, {
    ingredientId: ing.id,
    name: 'Diced',
    slug: 'diced',
    defaultUnit: 'g',
  });
  db.update(ingredientVariants)
    .set({
      defaultShelfLifeDaysFridge: shelfLife.fridge,
      defaultShelfLifeDaysFreezer: shelfLife.freezer,
    })
    .where(eq(ingredientVariants.id, variant.id))
    .run();
  const { version } = createRecipe(db, {
    slug: 'tomato-sauce',
    firstVersion: { title: 'Tomato sauce', bodyDsl: '@recipe(tomato-sauce)' },
  });
  db.update(recipeVersions)
    .set({ compileStatus: 'compiled' })
    .where(eq(recipeVersions.id, version.id))
    .run();
  return { variantId: variant.id, recipeVersionId: version.id };
}

describe('PRD-145 — createBatchManual', () => {
  let db: FoodDb;
  let variantId: number;

  beforeEach(() => {
    db = freshDb();
    ({ variantId } = seedFridgeFreezerVariant(db));
  });

  it('inserts a batch with explicit producedAt + expiresAt', () => {
    const result = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 500,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-10T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = db.select().from(batches).where(eq(batches.id, result.batchId)).get();
    expect(row?.qtyRemaining).toBe(500);
    expect(row?.sourceType).toBe('purchase');
    expect(row?.sourceId).toBeNull();
    expect(row?.expiresAt).toBe('2026-06-10T00:00:00.000Z');
  });

  it('defaults expiresAt from variant.default_shelf_life_days_fridge', () => {
    const producedAt = '2026-06-01T00:00:00.000Z';
    const result = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      producedAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = db.select().from(batches).where(eq(batches.id, result.batchId)).get();
    expect(row?.expiresAt).toBe('2026-06-06T00:00:00.000Z');
  });

  it('returns null expiresAt for shelf-stable pantry batches', () => {
    const result = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'pantry',
      sourceType: 'purchase',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = db.select().from(batches).where(eq(batches.id, result.batchId)).get();
    expect(row?.expiresAt).toBeNull();
  });

  it('returns null expiresAt when variant has no shelf-life days for the location', () => {
    const freshDbInstance = freshDb();
    const { variantId: v } = seedFridgeFreezerVariant(freshDbInstance, {
      fridge: null,
      freezer: null,
    });
    db = freshDbInstance;
    const result = createBatchManual(db, {
      variantId: v,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = db.select().from(batches).where(eq(batches.id, result.batchId)).get();
    expect(row?.expiresAt).toBeNull();
  });

  it('rejects BadExpiry when expiresAt precedes producedAt', () => {
    const result = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      producedAt: '2026-06-05T00:00:00.000Z',
      expiresAt: '2026-06-01T00:00:00.000Z',
    });
    expect(result).toEqual({ ok: false, reason: 'BadExpiry' });
  });

  it('addDays handles midnight UTC boundary deterministically', () => {
    const result = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 1,
      unit: 'g',
      location: 'fridge',
      sourceType: 'gift',
      producedAt: '2026-06-30T23:59:59.999Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = db.select().from(batches).where(eq(batches.id, result.batchId)).get();
    // 5 fridge days from 2026-06-30T23:59:59.999Z = 2026-07-05T23:59:59.999Z (UTC).
    expect(row?.expiresAt).toBe('2026-07-05T23:59:59.999Z');
  });
});

describe('PRD-145 — createBatchFromRun', () => {
  it('wraps markRunComplete and writes yielded_batch_id', () => {
    const db = freshDb();
    const { variantId, recipeVersionId } = seedFridgeFreezerVariant(db);
    const run = createRun(db, { recipeVersionId });

    const result = createBatchFromRun(db, run.id, {
      variantId,
      prepStateId: null,
      qty: 800,
      unit: 'g',
      location: 'fridge',
    });
    expect(result.batchId).not.toBeNull();
    const batch = db
      .select()
      .from(batches)
      .where(eq(batches.id, result.batchId ?? -1))
      .get();
    expect(batch?.sourceType).toBe('recipe_run');
    expect(batch?.sourceId).toBe(run.id);
  });

  it('handles yieldless cooks without creating a batch', () => {
    const db = freshDb();
    const { recipeVersionId } = seedFridgeFreezerVariant(db);
    const run = createRun(db, { recipeVersionId });
    const result = createBatchFromRun(db, run.id, null);
    expect(result.batchId).toBeNull();
  });
});

describe('PRD-145 — relocateBatch', () => {
  let db: FoodDb;
  let variantId: number;

  beforeEach(() => {
    db = freshDb();
    ({ variantId } = seedFridgeFreezerVariant(db, { fridge: 5, freezer: 90 }));
  });

  it('recomputes expiresAt when the previous value matched the auto-default', () => {
    const created = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      producedAt: '2026-06-01T00:00:00.000Z',
    });
    if (!created.ok) throw new Error('seed failed');
    const result = relocateBatch(db, created.batchId, 'freezer');
    expect(result).toEqual({ ok: true });
    const row = db.select().from(batches).where(eq(batches.id, created.batchId)).get();
    expect(row?.location).toBe('freezer');
    expect(row?.expiresAt).toBe('2026-08-30T00:00:00.000Z');
  });

  it('preserves user-overridden expiresAt on relocate', () => {
    const created = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-15T00:00:00.000Z',
    });
    if (!created.ok) throw new Error('seed failed');
    relocateBatch(db, created.batchId, 'freezer');
    const row = db.select().from(batches).where(eq(batches.id, created.batchId)).get();
    expect(row?.expiresAt).toBe('2026-06-15T00:00:00.000Z');
  });

  it('appends a relocation audit line to notes', () => {
    const created = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      producedAt: '2026-06-01T00:00:00.000Z',
    });
    if (!created.ok) throw new Error('seed failed');
    relocateBatch(db, created.batchId, 'freezer');
    const row = db.select().from(batches).where(eq(batches.id, created.batchId)).get();
    expect(row?.notes).toMatch(/^Moved to freezer on \d{4}-\d{2}-\d{2}$/);
  });

  it('rejects relocate on a soft-deleted batch', () => {
    const created = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
    });
    if (!created.ok) throw new Error('seed failed');
    deleteBatch(db, created.batchId);
    const result = relocateBatch(db, created.batchId, 'freezer');
    expect(result).toEqual({ ok: false, reason: 'BatchDeleted' });
  });

  it('returns BatchNotFound for missing ids', () => {
    expect(relocateBatch(db, 99999, 'freezer')).toEqual({ ok: false, reason: 'BatchNotFound' });
  });
});

describe('PRD-145 — editBatch', () => {
  let db: FoodDb;
  let variantId: number;
  let recipeVersionId: number;

  beforeEach(() => {
    db = freshDb();
    ({ variantId, recipeVersionId } = seedFridgeFreezerVariant(db));
  });

  it('rejects prepStateId edit on recipe_run-sourced batches', () => {
    const run = createRun(db, { recipeVersionId });
    const yielded = createBatchFromRun(db, run.id, {
      variantId,
      prepStateId: null,
      qty: 500,
      unit: 'g',
      location: 'fridge',
    });
    expect(yielded.batchId).not.toBeNull();
    const result = editBatch(db, yielded.batchId ?? -1, { prepStateId: null });
    expect(result).toEqual({ ok: false, reason: 'CannotEditFromRun' });
  });

  it('allows expiresAt edit on recipe_run-sourced batches', () => {
    const run = createRun(db, { recipeVersionId });
    const yielded = createBatchFromRun(db, run.id, {
      variantId,
      prepStateId: null,
      qty: 500,
      unit: 'g',
      location: 'fridge',
    });
    const batchId = yielded.batchId ?? -1;
    const stored = db.select().from(batches).where(eq(batches.id, batchId)).get();
    const newExpiry = new Date(
      new Date(stored?.producedAt ?? '').getTime() + 10 * 86_400_000
    ).toISOString();
    const result = editBatch(db, batchId, { expiresAt: newExpiry });
    expect(result).toEqual({ ok: true });
  });

  it('rejects BadExpiry when patch expiry precedes producedAt', () => {
    const created = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      producedAt: '2026-06-05T00:00:00.000Z',
    });
    if (!created.ok) throw new Error('seed failed');
    const result = editBatch(db, created.batchId, { expiresAt: '2026-06-01T00:00:00.000Z' });
    expect(result).toEqual({ ok: false, reason: 'BadExpiry' });
  });

  it('allows clearing expiresAt to null', () => {
    const created = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      producedAt: '2026-06-05T00:00:00.000Z',
    });
    if (!created.ok) throw new Error('seed failed');
    editBatch(db, created.batchId, { expiresAt: null });
    const row = db.select().from(batches).where(eq(batches.id, created.batchId)).get();
    expect(row?.expiresAt).toBeNull();
  });

  it('overwrites notes verbatim (no audit append)', () => {
    const created = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 200,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      notes: 'first',
    });
    if (!created.ok) throw new Error('seed failed');
    editBatch(db, created.batchId, { notes: 'second' });
    const row = db.select().from(batches).where(eq(batches.id, created.batchId)).get();
    expect(row?.notes).toBe('second');
  });
});

describe('PRD-145 — adjustBatchQty', () => {
  let db: FoodDb;
  let variantId: number;

  beforeEach(() => {
    db = freshDb();
    ({ variantId } = seedFridgeFreezerVariant(db));
  });

  function seedBatch(qty: number): number {
    const result = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
    });
    if (!result.ok) throw new Error('seed failed');
    return result.batchId;
  }

  it('decrements qty for spoiled with negative delta', () => {
    const id = seedBatch(500);
    const result = adjustBatchQty(db, id, -200, 'spoiled');
    expect(result).toEqual({ ok: true, newQty: 300 });
    const row = db.select().from(batches).where(eq(batches.id, id)).get();
    expect(row?.notes).toMatch(/Spoiled 200g/);
  });

  it('rejects BadAdjustment when spoiled paired with positive delta', () => {
    const id = seedBatch(500);
    expect(adjustBatchQty(db, id, 50, 'spoiled')).toEqual({
      ok: false,
      reason: 'BadAdjustment',
    });
  });

  it('rejects BadAdjustment when wasted paired with zero delta', () => {
    const id = seedBatch(500);
    expect(adjustBatchQty(db, id, 0, 'wasted')).toEqual({
      ok: false,
      reason: 'BadAdjustment',
    });
  });

  it('accepts positive correction (found more in the back)', () => {
    const id = seedBatch(500);
    const result = adjustBatchQty(db, id, 50, 'correction');
    expect(result).toEqual({ ok: true, newQty: 550 });
  });

  it('rejects NegativeQty when delta would push below zero', () => {
    const id = seedBatch(200);
    expect(adjustBatchQty(db, id, -300, 'wasted')).toEqual({
      ok: false,
      reason: 'NegativeQty',
    });
  });

  it('handles zero delta as a no-op', () => {
    const id = seedBatch(200);
    const result = adjustBatchQty(db, id, 0, 'correction');
    expect(result).toEqual({ ok: true, newQty: 200 });
  });

  it('rejects BatchDeleted for soft-deleted batches', () => {
    const id = seedBatch(200);
    deleteBatch(db, id);
    expect(adjustBatchQty(db, id, -50, 'spoiled')).toEqual({
      ok: false,
      reason: 'BatchDeleted',
    });
  });
});

describe('PRD-145 — deleteBatch + invariant', () => {
  let db: FoodDb;

  beforeEach(() => {
    db = freshDb();
  });

  it('sets qty_remaining=0 and deleted_at atomically', () => {
    const { variantId } = seedFridgeFreezerVariant(db);
    const created = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 250,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
    });
    if (!created.ok) throw new Error('seed failed');
    const result = deleteBatch(db, created.batchId);
    expect(result).toEqual({ ok: true });
    const row = db.select().from(batches).where(eq(batches.id, created.batchId)).get();
    expect(row?.qtyRemaining).toBe(0);
    expect(row?.deletedAt).not.toBeNull();
  });

  it('subsequent FIFO consumption skips a deleted batch', () => {
    const { variantId, recipeVersionId } = seedFridgeFreezerVariant(db);
    const a = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 300,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      producedAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-06-05T00:00:00.000Z',
    });
    const b = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 300,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      producedAt: '2026-06-02T00:00:00.000Z',
      expiresAt: '2026-06-06T00:00:00.000Z',
    });
    if (!a.ok || !b.ok) throw new Error('seed failed');
    deleteBatch(db, a.batchId);
    const run = createRun(db, { recipeVersionId });
    const result = consumeForRun(db, run.id, [
      { variantId, prepStateId: null, qty: 200, canonicalUnit: 'g' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The single consumption row should target the non-deleted batch b.
    expect(result.consumptions.map((c) => c.batchId)).toEqual([b.batchId]);
  });

  it('rejects subsequent delete on an already-deleted batch', () => {
    const { variantId } = seedFridgeFreezerVariant(db);
    const created = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 100,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
    });
    if (!created.ok) throw new Error('seed failed');
    deleteBatch(db, created.batchId);
    expect(deleteBatch(db, created.batchId)).toEqual({ ok: false, reason: 'BatchDeleted' });
  });
});

describe('PRD-145 — notes audit-trail truncation', () => {
  it('front-truncates to 500 chars with leading ellipsis when overflowing', () => {
    const db = freshDb();
    const { variantId } = seedFridgeFreezerVariant(db);
    const created = createBatchManual(db, {
      variantId,
      prepStateId: null,
      qty: 1000,
      unit: 'g',
      location: 'fridge',
      sourceType: 'purchase',
      notes: 'x'.repeat(490),
    });
    if (!created.ok) throw new Error('seed failed');
    relocateBatch(db, created.batchId, 'freezer');
    relocateBatch(db, created.batchId, 'pantry');
    const row = db.select().from(batches).where(eq(batches.id, created.batchId)).get();
    expect(row?.notes ?? '').toHaveLength(500);
    expect(row?.notes?.startsWith('…')).toBe(true);
  });
});

afterAll(() => {
  if (lastDb === null) return;
  expect(countDeletedInvariantViolations(lastDb)).toBe(0);
});
