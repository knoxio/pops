/**
 * Plan / batch / tag seeders for the PRD-152 shopping-generator suite.
 * Split out of `shopping-generator-helpers.ts` to stay under the per-file
 * lint cap.
 */
import { type Database } from 'better-sqlite3';

export interface SeedPlanEntryInput {
  date: string;
  recipeId: number;
  recipeVersionId?: number | null;
  plannedServings?: number;
  slot?: string;
  position?: number;
  /** Pass a `recipe_runs.id` (use `seedRecipeRun`) to mark this entry already cooked. */
  recipeRunId?: number | null;
}

export function seedPlanEntry(db: Database, opts: SeedPlanEntryInput): number {
  const row = db
    .prepare(
      `INSERT INTO plan_entries (
         date, slot, position, recipe_id, recipe_version_id, planned_servings, recipe_run_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
    )
    .get(
      opts.date,
      opts.slot ?? 'dinner',
      opts.position ?? 0,
      opts.recipeId,
      opts.recipeVersionId ?? null,
      opts.plannedServings ?? 1,
      opts.recipeRunId ?? null
    ) as { id: number };
  return row.id;
}

export interface SeedBatchInput {
  variantId: number;
  qtyRemaining: number;
  unit?: 'g' | 'ml' | 'count';
  deletedAt?: string | null;
  location?: 'pantry' | 'fridge' | 'freezer' | 'other';
  producedAt?: string;
}

export function seedBatch(db: Database, opts: SeedBatchInput): number {
  const row = db
    .prepare(
      `INSERT INTO batches (
         variant_id, qty_remaining, unit, source_type, location, produced_at, deleted_at
       ) VALUES (?, ?, ?, 'purchase', ?, ?, ?) RETURNING id`
    )
    .get(
      opts.variantId,
      opts.qtyRemaining,
      opts.unit ?? 'g',
      opts.location ?? 'fridge',
      opts.producedAt ?? new Date().toISOString(),
      opts.deletedAt ?? null
    ) as { id: number };
  return row.id;
}

export function tagIngredient(db: Database, ingredientId: number, tag: string): void {
  db.prepare(
    'INSERT INTO ingredient_tags (ingredient_id, tag) VALUES (?, ?) ON CONFLICT DO NOTHING'
  ).run(ingredientId, tag);
}

export function seedRecipeRun(db: Database, versionId: number): number {
  const row = db
    .prepare(
      "INSERT INTO recipe_runs (recipe_version_id, started_at, completed_at) VALUES (?, datetime('now'), datetime('now')) RETURNING id"
    )
    .get(versionId) as { id: number };
  return row.id;
}
