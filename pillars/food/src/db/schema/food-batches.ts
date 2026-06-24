/**
 *   batches             — one row per fridge/pantry/freezer slot
 *   recipe_runs         — cook events pinned to a version
 *   batch_consumptions  — (run, batch) draws — one row per FIFO touch
 *
 * The `default_shelf_life_days_{fridge,freezer}` columns on
 * `ingredient_variants` are declared in `./food-ingredients.ts` since
 * Drizzle requires the full table definition in one place.
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { ingredientVariants, prepStates } from './food-ingredients.js';
import { recipeVersions } from './food-recipes.js';

export const batches = sqliteTable(
  'batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    variantId: integer('variant_id')
      .notNull()
      .references(() => ingredientVariants.id),
    prepStateId: integer('prep_state_id').references(() => prepStates.id),
    qtyRemaining: real('qty_remaining').notNull(),
    unit: text('unit', { enum: ['g', 'ml', 'count'] }).notNull(),
    sourceType: text('source_type', {
      enum: ['purchase', 'recipe_run', 'gift', 'other'],
    }).notNull(),
    // Polymorphic by source_type — no FK; integrity enforced by service.
    sourceId: integer('source_id'),
    location: text('location', { enum: ['pantry', 'fridge', 'freezer', 'other'] }).notNull(),
    producedAt: text('produced_at').notNull(),
    expiresAt: text('expires_at'),
    notes: text('notes'),
    /**
     * Soft-delete timestamp. Set ONLY by `deleteBatch`; every row with
     * `deleted_at IS NOT NULL` also has `qty_remaining = 0`
     * (service-enforced invariant). The FIFO `consumeForRun` naturally
     * skips deleted rows via the `qty_remaining > 0` filter.
     */
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index('idx_batches_variant_prep').on(t.variantId, t.prepStateId),
    index('idx_batches_location_expiry').on(t.location, t.expiresAt),
    // Partial index `idx_batches_remaining ... WHERE qty_remaining > 0` —
    // hand-edited in the migration.
  ]
);

export const recipeRuns = sqliteTable(
  'recipe_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipeVersionId: integer('recipe_version_id')
      .notNull()
      .references(() => recipeVersions.id),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    scaleFactor: real('scale_factor').notNull().default(1.0),
    yieldedBatchId: integer('yielded_batch_id').references(() => batches.id),
    rating: integer('rating'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index('idx_recipe_runs_version').on(t.recipeVersionId),
    // Partial index `idx_recipe_runs_complete ... WHERE completed_at IS NOT NULL`
    // — hand-edited in the migration.
  ]
);

export const batchConsumptions = sqliteTable(
  'batch_consumptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipeRunId: integer('recipe_run_id')
      .notNull()
      .references(() => recipeRuns.id),
    batchId: integer('batch_id')
      .notNull()
      .references(() => batches.id),
    qtyConsumed: real('qty_consumed').notNull(),
    unit: text('unit', { enum: ['g', 'ml', 'count'] }).notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index('idx_batch_consumptions_run').on(t.recipeRunId),
    index('idx_batch_consumptions_batch').on(t.batchId),
  ]
);
