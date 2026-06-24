/**
 * Recipe-line aggregation for the send-to-list flow.
 *
 * Reads compiled `recipe_lines` for a version, splits into canonical
 * (`qty_g | qty_ml | qty_count` non-null) vs unconverted (all three null),
 * groups canonical rows by `(ingredient_id, variant_id, canonical_unit)`,
 * sums the matching qty field × `scaleFactor`, and collects distinct prep
 * slugs per group.
 *
 * Spec: pillars/food/docs/prds/send-to-list
 */
import { asc, eq } from 'drizzle-orm';

import {
  type FoodDb,
  ingredients,
  ingredientVariants,
  prepStates,
  recipeLines,
} from '../../../../db/index.js';
import { type AggregatedCanonical } from './types.js';

export interface UnconvertedAggregate {
  lineId: number;
  ingredientId: number;
  variantId: number | null;
  ingredientName: string;
  variantName: string | null;
  prepStateName: string | null;
  originalQty: number;
  originalUnit: string;
}

export interface AggregateResult {
  canonical: AggregatedCanonical[];
  unconverted: UnconvertedAggregate[];
}

interface JoinedLine {
  id: number;
  ingredientId: number;
  variantId: number | null;
  prepStateId: number | null;
  originalQty: number;
  originalUnit: string;
  qtyG: number | null;
  qtyMl: number | null;
  qtyCount: number | null;
  canonicalUnit: 'g' | 'ml' | 'count';
  ingredientName: string | null;
  variantName: string | null;
  prepStateSlug: string | null;
  prepStateName: string | null;
}

export function aggregateLinesForSend(
  db: FoodDb,
  versionId: number,
  scaleFactor: number
): AggregateResult {
  const rows = loadJoinedLines(db, versionId);
  const canonicalMap = new Map<string, AggregatedCanonical>();
  const unconverted: UnconvertedAggregate[] = [];
  for (const row of rows) {
    const qty = pickCanonicalQty(row);
    if (qty === null) {
      unconverted.push(rowToUnconverted(row));
      continue;
    }
    accumulate(canonicalMap, row, qty * scaleFactor);
  }
  return {
    canonical: [...canonicalMap.values()],
    unconverted,
  };
}

function loadJoinedLines(db: FoodDb, versionId: number): readonly JoinedLine[] {
  return db
    .select({
      id: recipeLines.id,
      ingredientId: recipeLines.ingredientId,
      variantId: recipeLines.variantId,
      prepStateId: recipeLines.prepStateId,
      originalQty: recipeLines.originalQty,
      originalUnit: recipeLines.originalUnit,
      qtyG: recipeLines.qtyG,
      qtyMl: recipeLines.qtyMl,
      qtyCount: recipeLines.qtyCount,
      canonicalUnit: recipeLines.canonicalUnit,
      ingredientName: ingredients.name,
      variantName: ingredientVariants.name,
      prepStateSlug: prepStates.slug,
      prepStateName: prepStates.name,
    })
    .from(recipeLines)
    .leftJoin(ingredients, eq(ingredients.id, recipeLines.ingredientId))
    .leftJoin(ingredientVariants, eq(ingredientVariants.id, recipeLines.variantId))
    .leftJoin(prepStates, eq(prepStates.id, recipeLines.prepStateId))
    .where(eq(recipeLines.recipeVersionId, versionId))
    .orderBy(asc(recipeLines.position))
    .all() as readonly JoinedLine[];
}

function pickCanonicalQty(row: JoinedLine): number | null {
  switch (row.canonicalUnit) {
    case 'g':
      return row.qtyG;
    case 'ml':
      return row.qtyMl;
    case 'count':
      return row.qtyCount;
    default:
      return null;
  }
}

function accumulate(
  map: Map<string, AggregatedCanonical>,
  row: JoinedLine,
  scaledQty: number
): void {
  const key = `${row.ingredientId}|${row.variantId ?? 'null'}|${row.canonicalUnit}`;
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, {
      ingredientId: row.ingredientId,
      variantId: row.variantId,
      canonicalUnit: row.canonicalUnit,
      qtySum: scaledQty,
      ingredientName: row.ingredientName ?? '',
      variantName: row.variantName,
      prepSlugs: new Set(row.prepStateSlug === null ? [] : [row.prepStateSlug]),
      sourceLineIds: [row.id],
    });
    return;
  }
  existing.qtySum += scaledQty;
  existing.sourceLineIds.push(row.id);
  if (row.prepStateSlug !== null) existing.prepSlugs.add(row.prepStateSlug);
}

function rowToUnconverted(row: JoinedLine): UnconvertedAggregate {
  return {
    lineId: row.id,
    ingredientId: row.ingredientId,
    variantId: row.variantId,
    ingredientName: row.ingredientName ?? '',
    variantName: row.variantName,
    prepStateName: row.prepStateName,
    originalQty: row.originalQty,
    originalUnit: row.originalUnit,
  };
}
