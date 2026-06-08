/**
 * Food domain — PRD-106 + PRD-107 schemas.
 *
 * Eight tables form the foundation:
 *   slug_registry         — global namespace shared by ingredients, recipes, prep_states (PRD-106)
 *   ingredients           — canonical hierarchy (max depth 3, app-enforced) (PRD-106)
 *   ingredient_variants   — presentations of an ingredient, slug-scoped per parent (PRD-106)
 *   prep_states           — small enum of trivial knife/process modifiers (PRD-106)
 *   ingredient_aliases    — case-insensitive lookup pointing at ingredient OR variant (PRD-106)
 *   recipes               — stable recipe identity (slug, type, hero, archived) (PRD-107)
 *   recipe_versions       — content snapshots: body_dsl, yield, compile_status (PRD-107)
 *   recipe_tags           — free-form tags per recipe (PRD-107)
 *
 * See `docs/themes/07-food/prds/106-ingredient-model/` and `107-recipe-model/`.
 *
 * The slug_registry is the cross-table uniqueness surface for entities
 * referenceable from the recipe DSL ([ADR-023]). Variants are deliberately
 * NOT in the registry — they're scoped under their parent ingredient. Tags
 * are also excluded (high-churn, not slug-referenced).
 */
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
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

// ── PRD-107 — Recipe & Version schema ────────────────────────────────────

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
    // source_id will reference ingest_sources(id) once PRD-110 lands; column
    // declared as plain integer for now to avoid a forward FK to a missing
    // table (drizzle would emit a malformed FK clause).
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
