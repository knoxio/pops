/**
 * `food.fridge.recipesUsingBatch` query — PRD-147.
 *
 * Returns recipes whose **current version** has a `recipe_lines` row
 * matching the batch's `variant_id`. Ordered by `last_cooked_at DESC`
 * (NULLS LAST) then by recipe slug. Variant-only join — see PRD-147
 * §Cook now: the variant match is deliberately not prep-aware (Epic 06
 * delivers a prep-aware solver).
 *
 * `recipeNeedsQty` is summed across matching `recipe_lines` whose
 * `canonical_unit` matches the batch's `unit`. When no matching-unit
 * line exists for a recipe, the field is `null` (UI renders "Needs ~?").
 */

import { and, asc, desc, eq, isNotNull, sql, type AnyColumn, type SQL } from 'drizzle-orm';

import {
  batches,
  recipeLines,
  recipeRuns,
  recipes,
  recipeVersions,
  type FoodDb,
} from '../../../db/index.js';

import type { BatchUnit, RecipeForCookRow } from '../../../db/index.js';

const DEFAULT_LIMIT = 20;

interface BatchKey {
  variantId: number;
  unit: BatchUnit;
}

export function recipesUsingBatch(
  db: FoodDb,
  batchId: number,
  limit: number = DEFAULT_LIMIT
): { items: readonly RecipeForCookRow[] } {
  const key = lookupBatchKey(db, batchId);
  if (key === null) return { items: [] };

  const candidates = db
    .select({
      recipeId: recipes.id,
      recipeSlug: recipes.slug,
      title: recipeVersions.title,
      recipeType: recipes.recipeType,
      lineCount: sql<number>`COUNT(${recipeLines.id})`,
      needsQty: sumQtyColumn(key.unit),
      lastCookedAt: sql<string | null>`MAX(${recipeRuns.completedAt})`,
    })
    .from(recipes)
    .innerJoin(recipeVersions, eq(recipeVersions.id, recipes.currentVersionId))
    .innerJoin(recipeLines, eq(recipeLines.recipeVersionId, recipeVersions.id))
    .leftJoin(
      recipeRuns,
      and(eq(recipeRuns.recipeVersionId, recipeVersions.id), isNotNull(recipeRuns.completedAt))
    )
    .where(eq(recipeLines.variantId, key.variantId))
    .groupBy(recipes.id, recipes.slug, recipeVersions.title, recipes.recipeType)
    .orderBy(
      sql`${sql<string | null>`MAX(${recipeRuns.completedAt})`} IS NULL`,
      desc(sql`MAX(${recipeRuns.completedAt})`),
      asc(recipes.slug)
    )
    .limit(limit)
    .all();

  const items: RecipeForCookRow[] = candidates.map((row) => ({
    recipeId: row.recipeId,
    recipeSlug: row.recipeSlug,
    title: row.title,
    recipeType: row.recipeType ?? null,
    lineCount: row.lineCount,
    recipeNeedsQty: row.needsQty,
    lastCookedAt: row.lastCookedAt,
  }));

  return { items };
}

function lookupBatchKey(db: FoodDb, batchId: number): BatchKey | null {
  const row = db
    .select({ variantId: batches.variantId, unit: batches.unit })
    .from(batches)
    .where(eq(batches.id, batchId))
    .get();
  return row ?? null;
}

function sumQtyColumn(unit: BatchUnit): SQL<number | null> {
  const col = qtyColumnFor(unit);
  return sql<
    number | null
  >`SUM(CASE WHEN ${recipeLines.canonicalUnit} = ${unit} THEN ${col} ELSE NULL END)`;
}

function qtyColumnFor(unit: BatchUnit): AnyColumn {
  if (unit === 'g') return recipeLines.qtyG;
  if (unit === 'ml') return recipeLines.qtyMl;
  return recipeLines.qtyCount;
}
