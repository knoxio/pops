/**
 * Test seed helpers for the PRD-152 shopping-generator integration suite.
 *
 * Composes a SQLite DB with the food + lists + plan + tags migrations
 * required for the generator path: ingredients, variants, recipes/versions,
 * lines, lists/items, batches (with `deleted_at`), plan_slots/entries,
 * ingredient_tags.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';

const MIGRATIONS: readonly string[] = [
  '0058_high_sentinel.sql', // ingredients/variants/prep_states/slug_registry
  '0059_useful_hiroim.sql', // recipes, recipe_versions, recipe_tags
  '0060_familiar_leo.sql', // batches, recipe_runs, batch_consumptions, ingredient_variants shelf-life
  '0061_shocking_skreet.sql', // substitutions (FKs from later migrations cascade)
  '0062_chemical_donald_blake.sql', // lists, list_items
  '0063_bumpy_wolverine.sql', // plan_slots, plan_entries
  '0065_prd_116_recipe_compile.sql', // recipe_lines, recipe_steps
  '0069_prd_145_batches_deleted_at.sql', // batches.deleted_at column
  '0070_prd_151_ingredient_tags.sql', // ingredient_tags
];

function applyMigration(db: Database, filename: string): void {
  const sql = readFileSync(join(__dirname, '../../../db/drizzle-migrations', filename), 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) db.exec(trimmed);
  }
}

export function createGeneratorTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const name of MIGRATIONS) applyMigration(db, name);
  seedDefaultPlanSlots(db);
  return db;
}

function seedDefaultPlanSlots(db: Database): void {
  const slots: readonly [string, string, number][] = [
    ['breakfast', 'Breakfast', 1],
    ['lunch', 'Lunch', 2],
    ['dinner', 'Dinner', 3],
    ['snack', 'Snack', 4],
    ['prep-session', 'Prep Session', 5],
  ];
  for (const [slug, name, order] of slots) {
    db.prepare(
      'INSERT INTO plan_slots (slug, name, display_order, is_default) VALUES (?, ?, ?, 1)'
    ).run(slug, name, order);
  }
}

export function seedIngredient(
  db: Database,
  name: string,
  slug: string,
  defaultUnit: 'g' | 'ml' | 'count' = 'g'
): number {
  const row = db
    .prepare('INSERT INTO ingredients (name, slug, default_unit) VALUES (?, ?, ?) RETURNING id')
    .get(name, slug, defaultUnit) as { id: number };
  db.prepare("INSERT INTO slug_registry (slug, kind, target_id) VALUES (?, 'ingredient', ?)").run(
    slug,
    row.id
  );
  return row.id;
}

export interface SeedVariantInput {
  ingredientId: number;
  slug: string;
  name: string;
  defaultUnit?: 'g' | 'ml' | 'count';
}

export function seedVariant(db: Database, opts: SeedVariantInput): number {
  const row = db
    .prepare(
      'INSERT INTO ingredient_variants (ingredient_id, name, slug, default_unit) VALUES (?, ?, ?, ?) RETURNING id'
    )
    .get(opts.ingredientId, opts.name, opts.slug, opts.defaultUnit ?? 'g') as { id: number };
  return row.id;
}

export function seedRecipe(db: Database, slug: string): number {
  const row = db
    .prepare("INSERT INTO recipes (slug, recipe_type) VALUES (?, 'plate') RETURNING id")
    .get(slug) as { id: number };
  db.prepare("INSERT INTO slug_registry (slug, kind, target_id) VALUES (?, 'recipe', ?)").run(
    slug,
    row.id
  );
  return row.id;
}

export interface SeedVersionInput {
  recipeId: number;
  title?: string;
  servings?: number | null;
  versionNo?: number;
  status?: 'draft' | 'current' | 'archived';
}

export function seedVersion(db: Database, opts: SeedVersionInput): number {
  const row = db
    .prepare(
      `INSERT INTO recipe_versions (
         recipe_id, version_no, status, title, body_dsl, compile_status, servings
       ) VALUES (?, ?, ?, ?, '', 'compiled', ?) RETURNING id`
    )
    .get(
      opts.recipeId,
      opts.versionNo ?? 1,
      opts.status ?? 'current',
      opts.title ?? 'Recipe',
      opts.servings ?? null
    ) as { id: number };
  if ((opts.status ?? 'current') === 'current') {
    db.prepare('UPDATE recipes SET current_version_id = ? WHERE id = ?').run(row.id, opts.recipeId);
  }
  return row.id;
}

export interface SeedLineInput {
  recipeVersionId: number;
  position: number;
  ingredientId: number;
  variantId?: number | null;
  originalQty?: number;
  originalUnit?: string;
  qtyG?: number | null;
  qtyMl?: number | null;
  qtyCount?: number | null;
  canonicalUnit?: 'g' | 'ml' | 'count';
  optional?: boolean;
}

export function seedLine(db: Database, opts: SeedLineInput): number {
  const row = db
    .prepare(
      `INSERT INTO recipe_lines (
         recipe_version_id, position, ingredient_id, variant_id,
         is_recipe_ref, original_text, original_qty, original_unit,
         qty_g, qty_ml, qty_count, canonical_unit, optional
       ) VALUES (?, ?, ?, ?, 0, 'l', ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    )
    .get(
      opts.recipeVersionId,
      opts.position,
      opts.ingredientId,
      opts.variantId ?? null,
      opts.originalQty ?? 0,
      opts.originalUnit ?? 'g',
      opts.qtyG ?? null,
      opts.qtyMl ?? null,
      opts.qtyCount ?? null,
      opts.canonicalUnit ?? 'g',
      opts.optional === true ? 1 : 0
    ) as { id: number };
  return row.id;
}

export {
  seedBatch,
  seedPlanEntry,
  seedRecipeRun,
  tagIngredient,
  type SeedBatchInput,
  type SeedPlanEntryInput,
} from './shopping-generator-seeders.js';
