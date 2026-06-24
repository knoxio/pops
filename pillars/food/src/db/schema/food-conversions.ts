/**
 *   unit_conversions   — universal `from_unit → to_unit (g|ml|count) × ratio`
 *   ingredient_weights — per-ingredient "1 of this unit weighs X grams"
 *
 * Read by `normaliseLineQty` (invoked from `compileRecipeVersion` per
 * `@ingredient` block); written via the contract handlers and the food
 * seed task.
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { ingredients, ingredientVariants } from './food-ingredients.js';

export const unitConversions = sqliteTable(
  'unit_conversions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fromUnit: text('from_unit').notNull(),
    toUnit: text('to_unit', { enum: ['g', 'ml', 'count'] }).notNull(),
    /** "1 from_unit = ratio to_unit". CHECK ratio > 0 enforced in migration. */
    ratio: real('ratio').notNull(),
    notes: text('notes'),
    /** 1 for seeded rows; 0 for user-added rows. */
    isSeeded: integer('is_seeded').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    unique('uq_unit_conversions_from_to').on(t.fromUnit, t.toUnit),
    index('idx_unit_conversions_from').on(t.fromUnit),
  ]
);

export const ingredientWeights = sqliteTable(
  'ingredient_weights',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** Null = applies to every variant of the ingredient. */
    variantId: integer('variant_id').references(() => ingredientVariants.id),
    /** Free-text — `medium`, `clove`, `head`, `cup-diced`, etc. */
    unit: text('unit').notNull(),
    /** Always grams. CHECK grams > 0 enforced in migration. */
    grams: real('grams').notNull(),
    notes: text('notes'),
    isSeeded: integer('is_seeded').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    // Drizzle-side UNIQUE — the migration also adds two partial UNIQUE
    // indexes so the (ingredient_id, NULL, unit) shape collapses correctly
    // under SQLite's NULL-distinct semantics.
    unique('uq_ingredient_weights_ing_var_unit').on(t.ingredientId, t.variantId, t.unit),
    index('idx_ingredient_weights_ingredient').on(t.ingredientId),
  ]
);
