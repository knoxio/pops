/**
 * Food domain — PRD-106 schema.
 *
 * Five tables form the foundation for every other food schema:
 *   slug_registry         — global namespace shared by ingredients, recipes, prep_states
 *   ingredients           — canonical hierarchy (max depth 3, app-enforced)
 *   ingredient_variants   — presentations of an ingredient, slug-scoped per parent
 *   prep_states           — small enum of trivial knife/process modifiers
 *   ingredient_aliases    — case-insensitive lookup pointing at ingredient OR variant
 *
 * See `docs/themes/07-food/prds/106-ingredient-model/README.md`.
 *
 * The slug_registry is the cross-table uniqueness surface for entities
 * referenceable from the recipe DSL ([ADR-023]). Variants are deliberately
 * NOT in the registry — they're scoped under their parent ingredient.
 */
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

export const slugRegistry = sqliteTable(
  'slug_registry',
  {
    slug: text('slug').primaryKey(),
    kind: text('kind', { enum: ['ingredient', 'recipe', 'prep_state'] }).notNull(),
    targetId: integer('target_id').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_slug_registry_kind_target').on(t.kind, t.targetId)]
);

export const ingredients = sqliteTable(
  'ingredients',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    parentId: integer('parent_id').references((): AnySQLiteColumn => ingredients.id),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    defaultUnit: text('default_unit', { enum: ['g', 'ml', 'count'] }).notNull(),
    densityGPerMl: real('density_g_per_ml'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index('idx_ingredients_parent').on(t.parentId),
    // Case-insensitive name index — see migration; drizzle-kit emits plain,
    // the migration is hand-edited to add COLLATE NOCASE.
    index('idx_ingredients_name').on(t.name),
  ]
);

export const ingredientVariants = sqliteTable(
  'ingredient_variants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    defaultUnit: text('default_unit', { enum: ['g', 'ml', 'count'] }).notNull(),
    packageSizeG: real('package_size_g'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    unique('uq_variants_ingredient_slug').on(t.ingredientId, t.slug),
    index('idx_variants_ingredient').on(t.ingredientId),
    index('idx_variants_name').on(t.name),
  ]
);

export const prepStates = sqliteTable('prep_states', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

export const ingredientAliases = sqliteTable(
  'ingredient_aliases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ingredientId: integer('ingredient_id').references(() => ingredients.id),
    variantId: integer('variant_id').references(() => ingredientVariants.id),
    alias: text('alias').notNull(),
    source: text('source', { enum: ['user', 'llm', 'ingest'] }).notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    // Exactly one of (ingredient_id, variant_id) must be set.
    check(
      'ck_aliases_xor_target',
      sql`(${t.ingredientId} IS NOT NULL) <> (${t.variantId} IS NOT NULL)`
    ),
    // Table-level UNIQUE per the PRD spec. Hand-edited to partial uniques in
    // the migration so SQLite's NULL-is-distinct rule doesn't let duplicates
    // slip through when variant_id (or ingredient_id) is NULL.
    unique('uq_aliases_alias_target').on(t.alias, t.ingredientId, t.variantId),
    // Case-insensitive alias index — migration hand-edited for COLLATE NOCASE.
    index('idx_aliases_alias').on(t.alias),
  ]
);
