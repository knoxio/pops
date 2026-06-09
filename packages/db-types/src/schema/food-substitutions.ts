import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { ingredients, ingredientVariants, recipes } from './food.js';

export const substitutions = sqliteTable(
  'substitutions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // "from" side: exactly one of from_ingredient_id, from_variant_id.
    fromIngredientId: integer('from_ingredient_id').references(() => ingredients.id),
    fromVariantId: integer('from_variant_id').references(() => ingredientVariants.id),
    // "to" side: exactly one of to_ingredient_id, to_variant_id.
    toIngredientId: integer('to_ingredient_id').references(() => ingredients.id),
    toVariantId: integer('to_variant_id').references(() => ingredientVariants.id),
    ratio: real('ratio').notNull().default(1.0),
    // JSON-encoded array of context strings. Empty array = wildcard.
    contextTags: text('context_tags').notNull().default('[]'),
    scope: text('scope', { enum: ['global', 'recipe'] })
      .notNull()
      .default('global'),
    recipeId: integer('recipe_id').references(() => recipes.id),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    // Exactly one of (from_ingredient_id, from_variant_id) is set.
    check(
      'ck_subs_xor_from',
      sql`(${t.fromIngredientId} IS NOT NULL) <> (${t.fromVariantId} IS NOT NULL)`
    ),
    // Exactly one of (to_ingredient_id, to_variant_id) is set.
    check(
      'ck_subs_xor_to',
      sql`(${t.toIngredientId} IS NOT NULL) <> (${t.toVariantId} IS NOT NULL)`
    ),
    // scope='recipe' iff recipe_id is set.
    check(
      'ck_subs_scope_recipe',
      sql`(${t.scope} = 'recipe' AND ${t.recipeId} IS NOT NULL) OR (${t.scope} = 'global' AND ${t.recipeId} IS NULL)`
    ),
    // Mirrors the enum CHECK in the migration so a schema-derived rebuild
    // can't accidentally drop it.
    check('ck_subs_scope', sql`${t.scope} IN ('global','recipe')`),
    // Ratio must be strictly positive.
    check('ck_subs_ratio_positive', sql`${t.ratio} > 0`),
    index('idx_subs_from_ing').on(t.fromIngredientId),
    index('idx_subs_from_var').on(t.fromVariantId),
    // Partial UNIQUE indexes for the global/recipe scope split live in the
    // migration — drizzle-kit can't express the WHERE clauses or the NULL-as-
    // distinct workaround the from/to four-column tuple needs.
  ]
);
