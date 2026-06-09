/**
 * Test seed helpers for the send-to-list integration suite.
 *
 * Spins up an in-memory SQLite with the food + lists migrations PRD-142
 * needs (ingredients/variants/prep_states + recipes/versions + list/items
 * + recipe_lines), then exposes typed inserters per table so the tests
 * stay declarative.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';

const MIGRATIONS: readonly string[] = [
  '0058_high_sentinel.sql', // ingredients, variants, prep_states, slug_registry
  '0059_useful_hiroim.sql', // recipes, recipe_versions, recipe_tags
  '0062_chemical_donald_blake.sql', // lists, list_items
  '0065_prd_116_recipe_compile.sql', // recipe_lines, recipe_steps, proposed_slugs
];

function applyMigration(db: Database, filename: string): void {
  const sql = readFileSync(join(__dirname, '../../../db/drizzle-migrations', filename), 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) db.exec(trimmed);
  }
}

export function createSendToListTestDb(): Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const name of MIGRATIONS) applyMigration(db, name);
  return db;
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
  db: Database;
  ingredientId: number;
  slug: string;
  name: string;
  defaultUnit?: 'g' | 'ml' | 'count';
}

export function seedVariant({
  db,
  ingredientId,
  slug,
  name,
  defaultUnit = 'g',
}: SeedVariantInput): number {
  const row = db
    .prepare(
      'INSERT INTO ingredient_variants (ingredient_id, name, slug, default_unit) VALUES (?, ?, ?, ?) RETURNING id'
    )
    .get(ingredientId, name, slug, defaultUnit) as { id: number };
  return row.id;
}

export function seedPrepState(db: Database, slug: string, name: string): number {
  const row = db
    .prepare('INSERT INTO prep_states (slug, name) VALUES (?, ?) RETURNING id')
    .get(slug, name) as { id: number };
  return row.id;
}

export function seedRecipe(db: Database, slug: string, recipeType = 'plate'): number {
  const row = db
    .prepare('INSERT INTO recipes (slug, recipe_type) VALUES (?, ?) RETURNING id')
    .get(slug, recipeType) as { id: number };
  db.prepare("INSERT INTO slug_registry (slug, kind, target_id) VALUES (?, 'recipe', ?)").run(
    slug,
    row.id
  );
  return row.id;
}

export interface SeedVersionOptions {
  recipeId: number;
  versionNo?: number;
  title?: string;
  bodyDsl?: string;
  compileStatus?: 'uncompiled' | 'compiled' | 'failed';
  status?: 'draft' | 'current' | 'archived';
}

export function seedRecipeVersion(db: Database, opts: SeedVersionOptions): number {
  const row = db
    .prepare(
      `INSERT INTO recipe_versions (
         recipe_id, version_no, status, title, body_dsl, compile_status
       ) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
    )
    .get(
      opts.recipeId,
      opts.versionNo ?? 1,
      opts.status ?? 'current',
      opts.title ?? 'Test Recipe',
      opts.bodyDsl ?? '',
      opts.compileStatus ?? 'compiled'
    ) as { id: number };
  if ((opts.status ?? 'current') === 'current') {
    db.prepare('UPDATE recipes SET current_version_id = ? WHERE id = ?').run(row.id, opts.recipeId);
  }
  return row.id;
}

export interface SeedLineOptions {
  recipeVersionId: number;
  position: number;
  ingredientId: number;
  variantId?: number | null;
  prepStateId?: number | null;
  originalText?: string;
  originalQty?: number;
  originalUnit?: string;
  qtyG?: number | null;
  qtyMl?: number | null;
  qtyCount?: number | null;
  canonicalUnit?: 'g' | 'ml' | 'count';
  optional?: boolean;
}

export function seedRecipeLine(db: Database, opts: SeedLineOptions): number {
  const row = db
    .prepare(
      `INSERT INTO recipe_lines (
         recipe_version_id, position, ingredient_id, variant_id, prep_state_id,
         is_recipe_ref, recipe_ref_id,
         original_text, original_qty, original_unit,
         qty_g, qty_ml, qty_count, canonical_unit, optional
       ) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    )
    .get(
      opts.recipeVersionId,
      opts.position,
      opts.ingredientId,
      opts.variantId ?? null,
      opts.prepStateId ?? null,
      opts.originalText ?? `line ${opts.position}`,
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

export function seedShoppingList(
  db: Database,
  name: string,
  ownerApp = 'food',
  archived = false
): number {
  const row = db
    .prepare(
      "INSERT INTO lists (name, kind, owner_app, archived_at) VALUES (?, 'shopping', ?, ?) RETURNING id"
    )
    .get(name, ownerApp, archived ? new Date().toISOString() : null) as { id: number };
  return row.id;
}

export function seedNonShoppingList(
  db: Database,
  name: string,
  kind: 'todo' | 'packing' | 'generic' = 'todo'
): number {
  const row = db
    .prepare("INSERT INTO lists (name, kind, owner_app) VALUES (?, ?, 'food') RETURNING id")
    .get(name, kind) as { id: number };
  return row.id;
}
