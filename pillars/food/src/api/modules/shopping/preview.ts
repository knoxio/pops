/**
 * `food.shopping.previewFromPlan` orchestrator — PRD-152.
 *
 * Single round-trip computation:
 *   1. Validate dates.
 *   2. Load plan entries in range (`recipe_run_id IS NULL`); resolve
 *      effective `recipe_version_id`; skip uncookable entries.
 *   3. Aggregate recipe lines × planned-servings scale → canonical /
 *      unconverted need groups.
 *   4. Subtract pantry batches by `(variant_id, canonical_unit)`.
 *   5. Resolve `store-section:*` tags + assemble sections.
 *   6. Return.
 */
import { aggregatePlanNeeds, type CanonicalNeed, type UnconvertedNeed } from './aggregate.js';
import { loadPlanEntriesForRange } from './load-plan.js';
import { loadTagsForIngredients } from './load-tags.js';
import { loadPantrySums, pantryKey } from './pantry.js';
import { buildSections } from './sections.js';
import { type GeneratorItem, type GeneratorPreview } from './types.js';
import { validateDateRange } from './validate.js';

import type { FoodDb } from '../../../db/index.js';

export interface PreviewInput {
  startDate: string;
  endDate: string;
}

export type PreviewResult =
  | { ok: true; preview: GeneratorPreview }
  | { ok: false; reason: 'BadDateRange' };

export function previewFromPlan(db: FoodDb, input: PreviewInput): PreviewResult {
  const validation = validateDateRange(input.startDate, input.endDate);
  if (!validation.ok) return { ok: false, reason: 'BadDateRange' };

  const planLoad = loadPlanEntriesForRange(db, input.startDate, input.endDate);
  const aggregate = aggregatePlanNeeds(db, planLoad.entries);
  const pantry = loadPantrySums(db, aggregate.canonical);

  const canonicalItems = aggregate.canonical.map((n) => toCanonicalItem(n, pantry.byVariantUnit));
  const unconvertedItems = aggregate.unconverted.map(toUnconvertedItem);

  const ingredientIds = collectIngredientIds(aggregate.canonical, aggregate.unconverted);
  const tagsByIngredientId = loadTagsForIngredients(db, ingredientIds);

  const sectioned = buildSections({
    canonicalItems,
    unconvertedItems,
    tagsByIngredientId,
  });

  return {
    ok: true,
    preview: {
      startDate: input.startDate,
      endDate: input.endDate,
      planEntryCount: planLoad.entries.length,
      skippedPlanEntryCount: planLoad.skippedCount,
      sections: sectioned.sections,
      uncategorisedIngredientIds: sectioned.uncategorisedIngredientIds,
      recipeTitles: aggregate.recipeTitles,
    },
  };
}

function toCanonicalItem(
  need: CanonicalNeed,
  pantrySums: ReadonlyMap<string, number>
): GeneratorItem {
  const pantryQty =
    need.variantId === null
      ? 0
      : (pantrySums.get(pantryKey(need.variantId, need.canonicalUnit)) ?? 0);
  const buyQty = Math.max(need.needQty - pantryQty, 0);
  return {
    ingredientId: need.ingredientId,
    ingredientName: need.ingredientName,
    variantId: need.variantId,
    variantName: need.variantName,
    needQty: need.needQty,
    pantryQty,
    buyQty,
    canonicalUnit: need.canonicalUnit,
    isUnconverted: false,
    originalQty: null,
    originalUnit: null,
    sourceLineIds: [...need.sourceLineIds],
  };
}

function toUnconvertedItem(need: UnconvertedNeed): GeneratorItem {
  return {
    ingredientId: need.ingredientId,
    ingredientName: need.ingredientName,
    variantId: need.variantId,
    variantName: need.variantName,
    needQty: need.originalQty,
    pantryQty: 0,
    buyQty: need.originalQty,
    canonicalUnit: need.canonicalUnit,
    isUnconverted: true,
    originalQty: need.originalQty,
    originalUnit: need.originalUnit,
    sourceLineIds: [need.sourceLineId],
  };
}

function collectIngredientIds(
  canonical: readonly CanonicalNeed[],
  unconverted: readonly UnconvertedNeed[]
): number[] {
  const set = new Set<number>();
  for (const c of canonical) set.add(c.ingredientId);
  for (const u of unconverted) set.add(u.ingredientId);
  return [...set];
}
