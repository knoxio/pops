/**
 * Load + group `recipe_lines` for the solver — PRD-150.
 *
 * The solver evaluates one recipe at a time but issues a single bulk
 * query for every required line across the candidate set. Optional
 * lines (`optional = 1`) are filtered HERE per PRD-150's contract:
 * they never block cookability and never appear in the breakdown.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';

import { ingredientVariants, ingredients, recipeLines, type FoodDb } from '../../../db/index.js';

export type CanonicalUnit = 'g' | 'ml' | 'count';

export interface SolverLine {
  recipeVersionId: number;
  position: number;
  ingredientId: number;
  ingredientName: string;
  variantId: number | null;
  variantName: string | null;
  prepStateId: number | null;
  canonicalUnit: CanonicalUnit;
  /**
   * Resolved canonical-unit qty for the line. `null` means the compile
   * stage couldn't resolve the canonical quantity (e.g. a missing
   * conversion). The line-evaluator treats that as a fail-closed
   * shortfall — a recipe with any unresolved line is never declared
   * cookable, otherwise the solver would silently approve recipes
   * with unknown demand.
   */
  qty: number | null;
}

function canonicalQty(
  qtyG: number | null,
  qtyMl: number | null,
  qtyCount: number | null,
  unit: CanonicalUnit
): number | null {
  switch (unit) {
    case 'g':
      return qtyG;
    case 'ml':
      return qtyMl;
    case 'count':
      return qtyCount;
  }
}

export function loadRequiredLines(
  db: FoodDb,
  recipeVersionIds: readonly number[]
): Map<number, readonly SolverLine[]> {
  if (recipeVersionIds.length === 0) return new Map();
  const rows = db
    .select({
      recipeVersionId: recipeLines.recipeVersionId,
      position: recipeLines.position,
      ingredientId: recipeLines.ingredientId,
      ingredientName: ingredients.name,
      variantId: recipeLines.variantId,
      variantName: ingredientVariants.name,
      prepStateId: recipeLines.prepStateId,
      canonicalUnit: recipeLines.canonicalUnit,
      qtyG: recipeLines.qtyG,
      qtyMl: recipeLines.qtyMl,
      qtyCount: recipeLines.qtyCount,
      optional: recipeLines.optional,
    })
    .from(recipeLines)
    .innerJoin(ingredients, eq(ingredients.id, recipeLines.ingredientId))
    .leftJoin(ingredientVariants, eq(ingredientVariants.id, recipeLines.variantId))
    .where(and(inArray(recipeLines.recipeVersionId, recipeVersionIds), eq(recipeLines.optional, 0)))
    .orderBy(asc(recipeLines.recipeVersionId), asc(recipeLines.position))
    .all();
  const map = new Map<number, SolverLine[]>();
  for (const row of rows) {
    const line: SolverLine = {
      recipeVersionId: row.recipeVersionId,
      position: row.position,
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName,
      variantId: row.variantId,
      variantName: row.variantName,
      prepStateId: row.prepStateId,
      canonicalUnit: row.canonicalUnit,
      qty: canonicalQty(row.qtyG, row.qtyMl, row.qtyCount, row.canonicalUnit),
    };
    const bucket = map.get(line.recipeVersionId);
    if (bucket === undefined) {
      map.set(line.recipeVersionId, [line]);
    } else {
      bucket.push(line);
    }
  }
  return map;
}
