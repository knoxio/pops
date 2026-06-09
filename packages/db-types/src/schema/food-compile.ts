/**
 *   recipe_lines                  — one row per @ingredient block; canonical-unit index
 *   recipe_steps                  — one row per @step block; markdown + resolved JSON
 *   recipe_version_proposed_slugs — unresolved-slug pointers from a failed compile
 *
 * Written by `compileRecipeVersion`. Read by the planner / solver / shopping-
 * list generators.
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { ingredients, ingredientVariants, prepStates } from './food-ingredients.js';
import { recipes, recipeVersions } from './food-recipes.js';

export const recipeLines = sqliteTable(
  'recipe_lines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipeVersionId: integer('recipe_version_id')
      .notNull()
      .references(() => recipeVersions.id),
    /** Matches the DSL `@ingredient(N, ...)` index — 1-based. */
    position: integer('position').notNull(),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    variantId: integer('variant_id').references(() => ingredientVariants.id),
    prepStateId: integer('prep_state_id').references(() => prepStates.id),
    isRecipeRef: integer('is_recipe_ref').notNull().default(0),
    recipeRefId: integer('recipe_ref_id').references(() => recipes.id),
    /** The descriptor as it appeared in the DSL (e.g. `banana:raw:mashed`). */
    originalText: text('original_text').notNull(),
    originalQty: real('original_qty').notNull(),
    originalUnit: text('original_unit').notNull(),
    qtyG: real('qty_g'),
    qtyMl: real('qty_ml'),
    qtyCount: real('qty_count'),
    canonicalUnit: text('canonical_unit', { enum: ['g', 'ml', 'count'] }).notNull(),
    optional: integer('optional').notNull().default(0),
    notes: text('notes'),
  },
  (t) => [
    unique('uq_recipe_lines_version_position').on(t.recipeVersionId, t.position),
    index('idx_recipe_lines_ingredient').on(t.ingredientId),
    // Partial `idx_recipe_lines_recipe_ref WHERE recipe_ref_id IS NOT NULL` —
    // hand-edited in the migration.
  ]
);

export const recipeSteps = sqliteTable(
  'recipe_steps',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipeVersionId: integer('recipe_version_id')
      .notNull()
      .references(() => recipeVersions.id),
    /** 1-based step order from the DSL. */
    position: integer('position').notNull(),
    /** Render-ready: `@N` and `@slug` refs rewritten to markdown anchors. */
    bodyMd: text('body_md').notNull(),
    /** Serialised `ResolvedStepBody` for the cooking-mode UI. */
    bodyResolvedJson: text('body_resolved_json').notNull(),
    durationMinutes: integer('duration_minutes'),
    temperatureValue: real('temperature_value'),
    temperatureUnit: text('temperature_unit', { enum: ['c', 'f', 'gas'] }),
  },
  (t) => [unique('uq_recipe_steps_version_position').on(t.recipeVersionId, t.position)]
);

export const recipeVersionProposedSlugs = sqliteTable(
  'recipe_version_proposed_slugs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipeVersionId: integer('recipe_version_id')
      .notNull()
      .references(() => recipeVersions.id),
    slug: text('slug').notNull(),
    suggestedKind: text('suggested_kind', {
      enum: ['ingredient', 'recipe', 'prep_state'],
    }),
    /** AST `SourceSpan`, serialised as JSON. */
    fromLocJson: text('from_loc_json').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index('idx_proposed_slugs_version').on(t.recipeVersionId),
    index('idx_proposed_slugs_slug').on(t.slug),
  ]
);
