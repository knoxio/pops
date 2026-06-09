/**
 *   recipes          — stable recipe identity (slug, type, hero, archived)
 *   recipe_versions  — content snapshots: body_dsl, yield, compile_status
 *   recipe_tags      — free-form tags per recipe
 */
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

import { ingredients, ingredientVariants, prepStates } from './food-ingredients.js';

export const recipes = sqliteTable(
  'recipes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    recipeType: text('recipe_type', {
      enum: ['plate', 'component', 'technique', 'sauce', 'dressing', 'drink', 'condiment'],
    })
      .notNull()
      .default('plate'),
    // Self-referential FK via the AnySQLiteColumn trick; recipe_versions is
    // declared below.
    currentVersionId: integer('current_version_id').references(
      (): AnySQLiteColumn => recipeVersions.id
    ),
    heroImagePath: text('hero_image_path'),
    archivedAt: text('archived_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_recipes_type').on(t.recipeType)]
);

export const recipeVersions = sqliteTable(
  'recipe_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id),
    versionNo: integer('version_no').notNull(),
    status: text('status', { enum: ['draft', 'current', 'archived'] })
      .notNull()
      .default('draft'),
    title: text('title').notNull(),
    summary: text('summary'),
    bodyDsl: text('body_dsl').notNull(),
    yieldIngredientId: integer('yield_ingredient_id').references(() => ingredients.id),
    yieldVariantId: integer('yield_variant_id').references(() => ingredientVariants.id),
    yieldPrepStateId: integer('yield_prep_state_id').references(() => prepStates.id),
    yieldQty: real('yield_qty'),
    yieldUnit: text('yield_unit'),
    servings: integer('servings'),
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    // Plain integer — the FK to `ingest_sources(id)` is added by the
    // ingest-sources migration to avoid a forward declaration here.
    sourceId: integer('source_id'),
    compileStatus: text('compile_status', { enum: ['uncompiled', 'compiled', 'failed'] })
      .notNull()
      .default('uncompiled'),
    compileError: text('compile_error'),
    compiledAt: text('compiled_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    unique('uq_recipe_versions_recipe_no').on(t.recipeId, t.versionNo),
    index('idx_recipe_versions_recipe').on(t.recipeId),
    index('idx_recipe_versions_status').on(t.status),
    index('idx_recipe_versions_compile').on(t.compileStatus),
    // The "at most one current per recipe" partial UNIQUE lives in the
    // migration — drizzle-kit can't express `WHERE status = 'current'`.
  ]
);

export const recipeTags = sqliteTable(
  'recipe_tags',
  {
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id),
    tag: text('tag').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.tag] }),
    // Case-insensitive tag index — migration hand-edited for COLLATE NOCASE.
    index('idx_recipe_tags_tag').on(t.tag),
  ]
);
