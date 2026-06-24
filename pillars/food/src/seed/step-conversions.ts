/**
 * Seed step — conversion fixtures.
 *
 * Inserts `unit_conversions` and `ingredient_weights` rows via the
 * conversions service so the same insert paths the CRUD UI uses get
 * exercised at seed time. Every row is marked `isSeeded=true` — the UI
 * surfaces these as protected (cannot be deleted via `deleteUnitConversion`
 * / `deleteIngredientWeight`).
 *
 * Idempotent contract matches every other seed step: callers wipe before
 * re-running. The orchestrator guards on `slug_registry` so a populated DB
 * short-circuits the whole seed.
 */
import { createIngredientWeight, createUnitConversion } from '../db/services/conversions.js';
import { INGREDIENT_WEIGHT_FIXTURES, UNIT_CONVERSION_FIXTURES } from './data-conversions.js';

import type { FoodDb } from '../db/services/internal.js';
import type { SeedContext } from './types.js';

export interface ConversionCounts {
  unitConversions: number;
  ingredientWeights: number;
}

export function seedConversions(db: FoodDb, ctx: SeedContext): ConversionCounts {
  let unitConversions = 0;
  for (const fixture of UNIT_CONVERSION_FIXTURES) {
    createUnitConversion(db, {
      fromUnit: fixture.fromUnit,
      toUnit: fixture.toUnit,
      ratio: fixture.ratio,
      notes: fixture.notes,
      isSeeded: true,
    });
    unitConversions += 1;
  }

  let ingredientWeights = 0;
  for (const fixture of INGREDIENT_WEIGHT_FIXTURES) {
    const ingredientId = ctx.ingredientIdBySlug.get(fixture.ingredientSlug);
    if (ingredientId === undefined) {
      throw new Error(
        `seedConversions: ingredient "${fixture.ingredientSlug}" not in SeedContext — ` +
          'seedIngredientsAndVariants must run first'
      );
    }
    const variantId = resolveVariantId(ctx, fixture.ingredientSlug, fixture.variantSlug);
    createIngredientWeight(db, {
      ingredientId,
      variantId,
      unit: fixture.unit,
      grams: fixture.grams,
      notes: fixture.notes,
      isSeeded: true,
    });
    ingredientWeights += 1;
  }

  return { unitConversions, ingredientWeights };
}

function resolveVariantId(
  ctx: SeedContext,
  ingredientSlug: string,
  variantSlug: string | null
): number | null {
  if (variantSlug === null) return null;
  const key = `${ingredientSlug}:${variantSlug}`;
  const variantId = ctx.variantIdByCompositeSlug.get(key);
  if (variantId === undefined) {
    throw new Error(`seedConversions: variant "${key}" not in SeedContext`);
  }
  return variantId;
}
