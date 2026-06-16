/**
 * SQL loaders for `substitutions-resolve-line` — PRD-149.
 *
 * Split out so the public service module + the hydration helper stay
 * under the 200-line per-file lint cap.
 */
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';

import {
  batches,
  ingredients,
  ingredientVariants,
  prepStates,
  recipeLines,
  recipeTags,
  recipeVersions,
} from '../../../db/index.js';

import type { FoodDb } from '../../../db/index.js';
import type { SubResolveLocation, SubResolveUnit } from './substitutions-resolve-line-types.js';

export interface LineRow {
  recipeId: number;
  ingredientId: number;
  variantId: number;
  variantName: string;
  prepStateId: number | null;
  prepStateLabel: string | null;
  qty: number;
  unit: SubResolveUnit;
}

export function loadLine(
  db: FoodDb,
  args: { recipeVersionId: number; lineIndex: number }
): LineRow | null {
  const row = db
    .select({
      recipeId: recipeVersions.recipeId,
      ingredientId: recipeLines.ingredientId,
      variantId: recipeLines.variantId,
      variantName: ingredientVariants.name,
      prepStateId: recipeLines.prepStateId,
      prepStateLabel: prepStates.name,
      qtyG: recipeLines.qtyG,
      qtyMl: recipeLines.qtyMl,
      qtyCount: recipeLines.qtyCount,
      canonicalUnit: recipeLines.canonicalUnit,
    })
    .from(recipeLines)
    .innerJoin(recipeVersions, eq(recipeVersions.id, recipeLines.recipeVersionId))
    .leftJoin(ingredientVariants, eq(ingredientVariants.id, recipeLines.variantId))
    .leftJoin(prepStates, eq(prepStates.id, recipeLines.prepStateId))
    .where(
      and(
        eq(recipeLines.recipeVersionId, args.recipeVersionId),
        eq(recipeLines.position, args.lineIndex)
      )
    )
    .all()[0];
  if (row === undefined) return null;
  if (row.variantId === null) return null;
  const qty = canonicalQty(row);
  if (qty === null) return null;
  return {
    recipeId: row.recipeId,
    ingredientId: row.ingredientId,
    variantId: row.variantId,
    variantName: row.variantName ?? '',
    prepStateId: row.prepStateId ?? null,
    prepStateLabel: row.prepStateLabel ?? null,
    qty,
    unit: row.canonicalUnit,
  };
}

function canonicalQty(row: {
  qtyG: number | null;
  qtyMl: number | null;
  qtyCount: number | null;
  canonicalUnit: 'g' | 'ml' | 'count';
}): number | null {
  if (row.canonicalUnit === 'g') return row.qtyG;
  if (row.canonicalUnit === 'ml') return row.qtyMl;
  return row.qtyCount;
}

export function loadRecipeTags(db: FoodDb, recipeId: number): readonly string[] {
  const rows = db
    .select({ tag: recipeTags.tag })
    .from(recipeTags)
    .where(eq(recipeTags.recipeId, recipeId))
    .all();
  return rows.map((r) => r.tag);
}

export interface VariantNameRow {
  id: number;
  name: string;
  ingredientId: number;
  ingredientName: string;
}

export function loadVariantNames(
  db: FoodDb,
  variantIds: readonly number[]
): Map<number, VariantNameRow> {
  const map = new Map<number, VariantNameRow>();
  if (variantIds.length === 0) return map;
  const rows = db
    .select({
      id: ingredientVariants.id,
      name: ingredientVariants.name,
      ingredientId: ingredientVariants.ingredientId,
      ingredientName: ingredients.name,
    })
    .from(ingredientVariants)
    .innerJoin(ingredients, eq(ingredients.id, ingredientVariants.ingredientId))
    .where(inArray(ingredientVariants.id, [...variantIds]))
    .all();
  for (const r of rows) map.set(r.id, r);
  return map;
}

export function loadVariantsByIngredient(
  db: FoodDb,
  ingredientIds: readonly number[]
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  if (ingredientIds.length === 0) return map;
  const rows = db
    .select({ id: ingredientVariants.id, ingredientId: ingredientVariants.ingredientId })
    .from(ingredientVariants)
    .where(inArray(ingredientVariants.ingredientId, [...ingredientIds]))
    .all();
  for (const r of rows) {
    const bucket = map.get(r.ingredientId);
    if (bucket === undefined) map.set(r.ingredientId, [r.id]);
    else bucket.push(r.id);
  }
  return map;
}

export interface BatchRow {
  id: number;
  variantId: number;
  qtyRemaining: number;
  unit: SubResolveUnit;
  location: SubResolveLocation;
  expiresAt: string | null;
  prepStateId: number | null;
  prepStateLabel: string | null;
  producedAt: string;
}

export function loadCandidateBatches(
  db: FoodDb,
  variantIds: readonly number[]
): Map<number, BatchRow[]> {
  const map = new Map<number, BatchRow[]>();
  if (variantIds.length === 0) return map;
  const rows = db
    .select({
      id: batches.id,
      variantId: batches.variantId,
      qtyRemaining: batches.qtyRemaining,
      unit: batches.unit,
      location: batches.location,
      expiresAt: batches.expiresAt,
      prepStateId: batches.prepStateId,
      prepStateLabel: prepStates.name,
      producedAt: batches.producedAt,
    })
    .from(batches)
    .leftJoin(prepStates, eq(prepStates.id, batches.prepStateId))
    .where(
      and(
        inArray(batches.variantId, [...variantIds]),
        gt(batches.qtyRemaining, 0),
        isNull(batches.deletedAt)
      )
    )
    .all();
  const enriched = rows.map((r) => ({ ...r, prepStateLabel: r.prepStateLabel ?? null }));
  enriched.sort(compareFifo);
  for (const row of enriched) {
    const bucket = map.get(row.variantId);
    if (bucket === undefined) map.set(row.variantId, [row]);
    else bucket.push(row);
  }
  return map;
}

function compareFifo(a: BatchRow, b: BatchRow): number {
  const aExp = a.expiresAt;
  const bExp = b.expiresAt;
  if (aExp === null && bExp !== null) return 1;
  if (aExp !== null && bExp === null) return -1;
  if (aExp !== null && bExp !== null) {
    const cmp = aExp.localeCompare(bExp);
    if (cmp !== 0) return cmp;
  }
  return a.producedAt.localeCompare(b.producedAt);
}
