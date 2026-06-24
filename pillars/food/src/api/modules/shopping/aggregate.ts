/**
 * Aggregator — walks every plan entry's recipe lines, scales by
 * `planned_servings / recipe_versions.servings` (falling back to 1.0 when
 * servings is null), groups by `(ingredient_id, variant_id, canonical_unit)`,
 * and emits two collections:
 *
 *   - `canonical[]`: rows where the source line had a non-null canonical qty
 *     (`qty_g | qty_ml | qty_count`).
 *   - `unconverted[]`: rows where the source line had all three canonical qty
 *     fields null — one row per source line (no merging).
 *
 * Optional lines (`recipe_lines.optional = 1`) are filtered out at the SQL
 * boundary so they never enter the need set.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';

import { type FoodDb, ingredients, ingredientVariants, recipeLines } from '../../../db/index.js';
import { type PlanEntryNeed } from './load-plan.js';
import { type CanonicalUnit } from './types.js';

export interface CanonicalNeed {
  ingredientId: number;
  ingredientName: string;
  variantId: number | null;
  variantName: string | null;
  canonicalUnit: CanonicalUnit;
  needQty: number;
  sourceLineIds: number[];
}

export interface UnconvertedNeed {
  ingredientId: number;
  ingredientName: string;
  variantId: number | null;
  variantName: string | null;
  /** Always derived from the line's canonical_unit (NOT NULL). */
  canonicalUnit: CanonicalUnit;
  originalQty: number;
  originalUnit: string;
  sourceLineId: number;
}

export interface AggregateResult {
  canonical: CanonicalNeed[];
  unconverted: UnconvertedNeed[];
  /**
   * Recipe titles encountered, in plan-date order (earliest plan entry that
   * referenced the recipe first). Powers the default list-name + the
   * `notes` provenance string per AC.
   */
  recipeTitles: string[];
}

interface JoinedLine {
  lineId: number;
  recipeVersionId: number;
  ingredientId: number;
  ingredientName: string;
  variantId: number | null;
  variantName: string | null;
  qtyG: number | null;
  qtyMl: number | null;
  qtyCount: number | null;
  canonicalUnit: CanonicalUnit;
  originalQty: number;
  originalUnit: string;
}

export function aggregatePlanNeeds(db: FoodDb, entries: readonly PlanEntryNeed[]): AggregateResult {
  if (entries.length === 0) {
    return { canonical: [], unconverted: [], recipeTitles: [] };
  }
  const versionIds = [...new Set(entries.map((e) => e.recipeVersionId))];
  const linesByVersion = loadLinesGroupedByVersion(db, versionIds);

  const canonicalMap = new Map<string, CanonicalNeed>();
  const unconverted: UnconvertedNeed[] = [];
  const recipeTitles = collectRecipeTitles(entries);

  for (const entry of entries) {
    const lines = linesByVersion.get(entry.recipeVersionId) ?? [];
    const scale = computeScale(entry.plannedServings, entry.versionServings);
    for (const line of lines) {
      const qty = pickCanonicalQty(line);
      if (qty === null) {
        unconverted.push(toUnconverted(line));
        continue;
      }
      accumulateCanonical(canonicalMap, line, qty * scale);
    }
  }
  return { canonical: [...canonicalMap.values()], unconverted, recipeTitles };
}

function computeScale(plannedServings: number, versionServings: number | null): number {
  if (versionServings === null || versionServings <= 0) return 1.0;
  return plannedServings / versionServings;
}

function pickCanonicalQty(line: JoinedLine): number | null {
  switch (line.canonicalUnit) {
    case 'g':
      return line.qtyG;
    case 'ml':
      return line.qtyMl;
    case 'count':
      return line.qtyCount;
  }
}

function accumulateCanonical(
  map: Map<string, CanonicalNeed>,
  line: JoinedLine,
  scaledQty: number
): void {
  const key = `${line.ingredientId}|${line.variantId ?? 'null'}|${line.canonicalUnit}`;
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, {
      ingredientId: line.ingredientId,
      ingredientName: line.ingredientName,
      variantId: line.variantId,
      variantName: line.variantName,
      canonicalUnit: line.canonicalUnit,
      needQty: scaledQty,
      sourceLineIds: [line.lineId],
    });
    return;
  }
  existing.needQty += scaledQty;
  existing.sourceLineIds.push(line.lineId);
}

function toUnconverted(line: JoinedLine): UnconvertedNeed {
  return {
    ingredientId: line.ingredientId,
    ingredientName: line.ingredientName,
    variantId: line.variantId,
    variantName: line.variantName,
    canonicalUnit: line.canonicalUnit,
    originalQty: line.originalQty,
    originalUnit: line.originalUnit,
    sourceLineId: line.lineId,
  };
}

function loadLinesGroupedByVersion(
  db: FoodDb,
  versionIds: readonly number[]
): Map<number, JoinedLine[]> {
  const rows = db
    .select({
      lineId: recipeLines.id,
      recipeVersionId: recipeLines.recipeVersionId,
      ingredientId: recipeLines.ingredientId,
      ingredientName: ingredients.name,
      variantId: recipeLines.variantId,
      variantName: ingredientVariants.name,
      qtyG: recipeLines.qtyG,
      qtyMl: recipeLines.qtyMl,
      qtyCount: recipeLines.qtyCount,
      canonicalUnit: recipeLines.canonicalUnit,
      originalQty: recipeLines.originalQty,
      originalUnit: recipeLines.originalUnit,
      optional: recipeLines.optional,
    })
    .from(recipeLines)
    .innerJoin(ingredients, eq(ingredients.id, recipeLines.ingredientId))
    .leftJoin(ingredientVariants, eq(ingredientVariants.id, recipeLines.variantId))
    .where(and(inArray(recipeLines.recipeVersionId, [...versionIds]), eq(recipeLines.optional, 0)))
    .orderBy(asc(recipeLines.recipeVersionId), asc(recipeLines.position))
    .all();
  const map = new Map<number, JoinedLine[]>();
  for (const r of rows) {
    const list = map.get(r.recipeVersionId);
    const joined: JoinedLine = {
      lineId: r.lineId,
      recipeVersionId: r.recipeVersionId,
      ingredientId: r.ingredientId,
      ingredientName: r.ingredientName,
      variantId: r.variantId,
      variantName: r.variantName,
      qtyG: r.qtyG,
      qtyMl: r.qtyMl,
      qtyCount: r.qtyCount,
      canonicalUnit: r.canonicalUnit,
      originalQty: r.originalQty,
      originalUnit: r.originalUnit,
    };
    if (list === undefined) map.set(r.recipeVersionId, [joined]);
    else list.push(joined);
  }
  return map;
}

function collectRecipeTitles(entries: readonly PlanEntryNeed[]): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const e of entries) {
    if (seen.has(e.recipeTitle)) continue;
    seen.add(e.recipeTitle);
    titles.push(e.recipeTitle);
  }
  return titles;
}
