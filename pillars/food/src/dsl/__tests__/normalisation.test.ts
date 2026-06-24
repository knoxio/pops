/**
 * Normalisation invariants (spec: pillars/food/docs/prds/conversion-table).
 *
 * Drives `normaliseLineQty` against an in-memory SQLite seeded with the
 * conversion-table migrations on top of the ingredients schema. Each test
 * asserts BOTH the returned shape and the resolution path.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb } from '../../db/open-food-db.js';
import * as conversionsService from '../../db/services/conversions.js';
import * as ingredientsService from '../../db/services/ingredients.js';
import { type FoodDb } from '../../db/services/internal.js';
import * as variantsService from '../../db/services/variants.js';
import { normaliseLineQty } from '../normalisation.js';

const { createIngredientWeight, createUnitConversion } = conversionsService;
const { createIngredient } = ingredientsService;
const { createVariant } = variantsService;

function freshDb(): FoodDb {
  return openFoodDb(':memory:').db;
}

describe('normaliseLineQty', () => {
  let db: FoodDb;

  beforeEach(() => {
    db = freshDb();
  });

  it('identity carry-over: g → qty_g equals input qty; other fields null', () => {
    const onion = createIngredient(db, { name: 'Onion', slug: 'onion', defaultUnit: 'g' });
    const out = normaliseLineQty(db, {
      ingredientId: onion.id,
      variantId: null,
      unit: 'g',
      qty: 250,
      ingredientDefaultUnit: 'g',
    });
    expect(out).toEqual({ qtyG: 250, qtyMl: null, qtyCount: null, canonicalUnit: 'g' });
  });

  it('identity carry-over: ml + count', () => {
    const milk = createIngredient(db, { name: 'Milk', slug: 'milk', defaultUnit: 'ml' });
    const egg = createIngredient(db, { name: 'Egg', slug: 'egg', defaultUnit: 'count' });
    expect(
      normaliseLineQty(db, {
        ingredientId: milk.id,
        variantId: null,
        unit: 'ml',
        qty: 500,
        ingredientDefaultUnit: 'ml',
      }).qtyMl
    ).toBe(500);
    expect(
      normaliseLineQty(db, {
        ingredientId: egg.id,
        variantId: null,
        unit: 'count',
        qty: 3,
        ingredientDefaultUnit: 'count',
      }).qtyCount
    ).toBe(3);
  });

  it('unit conversion: input cup with cup→ml=240 → qty_ml = qty × 240', () => {
    const milk = createIngredient(db, { name: 'Milk', slug: 'milk', defaultUnit: 'ml' });
    createUnitConversion(db, { fromUnit: 'cup', toUnit: 'ml', ratio: 240, isSeeded: true });
    const out = normaliseLineQty(db, {
      ingredientId: milk.id,
      variantId: null,
      unit: 'cup',
      qty: 2,
      ingredientDefaultUnit: 'ml',
    });
    expect(out).toEqual({ qtyG: null, qtyMl: 480, qtyCount: null, canonicalUnit: 'ml' });
  });

  it('ingredient weight beats generic conversion: medium onion → 150g per (per-ingredient, null-variant)', () => {
    const onion = createIngredient(db, { name: 'Onion', slug: 'onion', defaultUnit: 'count' });
    createIngredientWeight(db, {
      ingredientId: onion.id,
      variantId: null,
      unit: 'medium',
      grams: 150,
      isSeeded: true,
    });
    // Even though there's no generic "medium → *" conversion, the weight wins.
    const out = normaliseLineQty(db, {
      ingredientId: onion.id,
      variantId: null,
      unit: 'medium',
      qty: 2,
      ingredientDefaultUnit: 'count',
    });
    expect(out).toEqual({ qtyG: 300, qtyMl: null, qtyCount: null, canonicalUnit: 'g' });
  });

  it('variant-specific weight wins over null-variant weight for the same (ingredient, unit)', () => {
    const tomato = createIngredient(db, {
      name: 'Tomato',
      slug: 'tomato',
      defaultUnit: 'count',
    });
    const roma = createVariant(db, {
      ingredientId: tomato.id,
      slug: 'roma',
      name: 'Roma',
      defaultUnit: 'count',
    });
    createIngredientWeight(db, {
      ingredientId: tomato.id,
      variantId: null,
      unit: 'medium',
      grams: 150,
    });
    createIngredientWeight(db, {
      ingredientId: tomato.id,
      variantId: roma.id,
      unit: 'medium',
      grams: 80,
    });
    const out = normaliseLineQty(db, {
      ingredientId: tomato.id,
      variantId: roma.id,
      unit: 'medium',
      qty: 3,
      ingredientDefaultUnit: 'count',
    });
    expect(out.qtyG).toBe(240); // 3 × 80, not 3 × 150
    expect(out.canonicalUnit).toBe('g');
  });

  it('ingredient weight tried with variant first, then falls back to null-variant row', () => {
    const onion = createIngredient(db, { name: 'Onion', slug: 'onion', defaultUnit: 'count' });
    const yellow = createVariant(db, {
      ingredientId: onion.id,
      slug: 'yellow',
      name: 'Yellow',
      defaultUnit: 'count',
    });
    // Only a null-variant row exists.
    createIngredientWeight(db, {
      ingredientId: onion.id,
      variantId: null,
      unit: 'medium',
      grams: 150,
    });
    const out = normaliseLineQty(db, {
      ingredientId: onion.id,
      variantId: yellow.id,
      unit: 'medium',
      qty: 1,
      ingredientDefaultUnit: 'count',
    });
    expect(out.qtyG).toBe(150);
  });

  it('unresolved unit: no row → all qty_* null + canonical_unit falls back to ingredient default', () => {
    const flour = createIngredient(db, { name: 'Flour', slug: 'flour', defaultUnit: 'g' });
    const out = normaliseLineQty(db, {
      ingredientId: flour.id,
      variantId: null,
      unit: 'packets',
      qty: 2,
      ingredientDefaultUnit: 'g',
    });
    expect(out).toEqual({ qtyG: null, qtyMl: null, qtyCount: null, canonicalUnit: 'g' });
  });

  it('unit conversion to g: oz → g=28.35 produces qty_g', () => {
    const beef = createIngredient(db, { name: 'Beef', slug: 'beef', defaultUnit: 'g' });
    createUnitConversion(db, { fromUnit: 'oz', toUnit: 'g', ratio: 28.35 });
    const out = normaliseLineQty(db, {
      ingredientId: beef.id,
      variantId: null,
      unit: 'oz',
      qty: 16,
      ingredientDefaultUnit: 'g',
    });
    expect(out.qtyG).toBeCloseTo(453.6, 1);
    expect(out.canonicalUnit).toBe('g');
  });

  it('unit conversion to count: each → count=1', () => {
    const apple = createIngredient(db, { name: 'Apple', slug: 'apple', defaultUnit: 'count' });
    createUnitConversion(db, { fromUnit: 'each', toUnit: 'count', ratio: 1, isSeeded: true });
    const out = normaliseLineQty(db, {
      ingredientId: apple.id,
      variantId: null,
      unit: 'each',
      qty: 4,
      ingredientDefaultUnit: 'count',
    });
    expect(out).toEqual({ qtyG: null, qtyMl: null, qtyCount: 4, canonicalUnit: 'count' });
  });
});
