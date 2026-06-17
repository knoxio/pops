/**
 * Internal data loaders for `prepareCook` — split out of `prepare.ts` so
 * the public file stays under the 200-line lint cap.
 */
import { eq } from 'drizzle-orm';

import {
  type FoodDb,
  ingredients,
  ingredientVariants,
  planEntries,
  prepStates,
  recipeLines,
  recipes,
  recipeVersions,
} from '../../../db/index.js';
import { PrepareCookError } from './prepare-error.js';

import type { LineConsumeNeed } from '../../../domain/types/batches.js';
import type { CookYieldDefault } from '../../../domain/types/cook.js';

export interface VersionRow {
  id: number;
  title: string;
  slug: string;
  versionNo: number;
  servings: number | null;
  yieldIngredientId: number | null;
  yieldVariantId: number | null;
  yieldPrepStateId: number | null;
  yieldQty: number | null;
  yieldUnit: string | null;
}

export function loadVersion(db: FoodDb, versionId: number): VersionRow | null {
  const rows = db
    .select({
      id: recipeVersions.id,
      title: recipeVersions.title,
      slug: recipes.slug,
      versionNo: recipeVersions.versionNo,
      servings: recipeVersions.servings,
      yieldIngredientId: recipeVersions.yieldIngredientId,
      yieldVariantId: recipeVersions.yieldVariantId,
      yieldPrepStateId: recipeVersions.yieldPrepStateId,
      yieldQty: recipeVersions.yieldQty,
      yieldUnit: recipeVersions.yieldUnit,
    })
    .from(recipeVersions)
    .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
    .where(eq(recipeVersions.id, versionId))
    .all();
  return rows[0] ?? null;
}

export interface PlanContext {
  defaultScaleFactor: number;
  alreadyCooked: boolean;
}

export function resolvePlanContext(db: FoodDb, planEntryId: number | undefined): PlanContext {
  if (planEntryId === undefined) return { defaultScaleFactor: 1, alreadyCooked: false };
  const rows = db
    .select({
      plannedServings: planEntries.plannedServings,
      recipeRunId: planEntries.recipeRunId,
      recipeVersionId: planEntries.recipeVersionId,
    })
    .from(planEntries)
    .where(eq(planEntries.id, planEntryId))
    .all();
  const row = rows[0];
  if (row === undefined) throw new PrepareCookError('PlanEntryNotFound');
  const defaultScale = resolveDefaultScale(db, row.recipeVersionId, row.plannedServings);
  return { defaultScaleFactor: defaultScale, alreadyCooked: row.recipeRunId !== null };
}

function resolveDefaultScale(
  db: FoodDb,
  versionId: number | null,
  plannedServings: number
): number {
  if (versionId === null) return 1;
  const v = db
    .select({ servings: recipeVersions.servings })
    .from(recipeVersions)
    .where(eq(recipeVersions.id, versionId))
    .all()[0];
  const servings = v?.servings ?? null;
  if (servings === null || servings <= 0 || plannedServings <= 0) return 1;
  return plannedServings / servings;
}

export function resolveYieldDefault(db: FoodDb, version: VersionRow): CookYieldDefault | null {
  const validUnit = asCanonicalUnit(version.yieldUnit);
  if (version.yieldIngredientId === null) return null;
  if (version.yieldVariantId === null) return null;
  if (version.yieldQty === null) return null;
  if (validUnit === null) return null;
  const variant = loadVariantShelfLife(db, version.yieldVariantId);
  const prepStateLabel = loadPrepStateLabel(db, version.yieldPrepStateId);
  return {
    qty: version.yieldQty,
    unit: validUnit,
    variantName: variant?.name ?? null,
    prepStateLabel,
    shelfLifeFridgeDays: variant?.shelfFridge ?? null,
    shelfLifeFreezerDays: variant?.shelfFreezer ?? null,
  };
}

function asCanonicalUnit(raw: string | null): 'g' | 'ml' | 'count' | null {
  if (raw === 'g' || raw === 'ml' || raw === 'count') return raw;
  return null;
}

interface VariantShelf {
  name: string;
  shelfFridge: number | null;
  shelfFreezer: number | null;
}

function loadVariantShelfLife(db: FoodDb, variantId: number): VariantShelf | null {
  const row = db
    .select({
      name: ingredientVariants.name,
      shelfFridge: ingredientVariants.defaultShelfLifeDaysFridge,
      shelfFreezer: ingredientVariants.defaultShelfLifeDaysFreezer,
    })
    .from(ingredientVariants)
    .where(eq(ingredientVariants.id, variantId))
    .all()[0];
  return row ?? null;
}

function loadPrepStateLabel(db: FoodDb, prepStateId: number | null): string | null {
  if (prepStateId === null) return null;
  const row = db
    .select({ name: prepStates.name })
    .from(prepStates)
    .where(eq(prepStates.id, prepStateId))
    .all()[0];
  return row?.name ?? null;
}

export function loadConsumeNeeds(db: FoodDb, versionId: number): LineConsumeNeed[] {
  // PRD-146 expects the enriched `LineConsumeNeed` shape (lineIndex +
  // ingredient/variant names + optional flag). We left-join on
  // prep_states so lines without one fall through with a null label.
  const rows = db
    .select({
      lineIndex: recipeLines.position,
      ingredientId: recipeLines.ingredientId,
      ingredientName: ingredients.name,
      variantId: recipeLines.variantId,
      variantName: ingredientVariants.name,
      prepStateId: recipeLines.prepStateId,
      prepStateLabel: prepStates.name,
      qtyG: recipeLines.qtyG,
      qtyMl: recipeLines.qtyMl,
      qtyCount: recipeLines.qtyCount,
      canonicalUnit: recipeLines.canonicalUnit,
      optional: recipeLines.optional,
    })
    .from(recipeLines)
    .innerJoin(ingredients, eq(ingredients.id, recipeLines.ingredientId))
    .leftJoin(ingredientVariants, eq(ingredientVariants.id, recipeLines.variantId))
    .leftJoin(prepStates, eq(prepStates.id, recipeLines.prepStateId))
    .where(eq(recipeLines.recipeVersionId, versionId))
    .all();
  const needs: LineConsumeNeed[] = [];
  for (const r of rows) {
    if (r.variantId === null) continue;
    const qty = canonicalQty(r);
    if (qty === null || qty <= 0) continue;
    needs.push({
      lineIndex: r.lineIndex,
      ingredientId: r.ingredientId,
      ingredientName: r.ingredientName,
      variantId: r.variantId,
      variantName: r.variantName ?? '',
      prepStateId: r.prepStateId ?? null,
      prepStateLabel: r.prepStateLabel ?? null,
      qty,
      canonicalUnit: r.canonicalUnit,
      optional: r.optional === 1,
    });
  }
  return needs;
}

interface LineQtyRow {
  qtyG: number | null;
  qtyMl: number | null;
  qtyCount: number | null;
  canonicalUnit: 'g' | 'ml' | 'count';
}

function canonicalQty(row: LineQtyRow): number | null {
  if (row.canonicalUnit === 'g') return row.qtyG;
  if (row.canonicalUnit === 'ml') return row.qtyMl;
  return row.qtyCount;
}
