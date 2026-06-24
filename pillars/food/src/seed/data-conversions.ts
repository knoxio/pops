/**
 * Conversion-table fixtures.
 *
 * `UNIT_CONVERSION_FIXTURES` populates `unit_conversions`: a small generic
 * set covering the units the seed's sample recipes actually use plus the
 * common kitchen-volume measures so the conversion-table CRUD pages and the
 * compile path have rows to exercise.
 *
 * `INGREDIENT_WEIGHT_FIXTURES` populates `ingredient_weights`: just enough
 * to demonstrate the variant-specific and null-variant fallback paths in
 * `resolveCanonicalQty`. Ingredients are referenced by slug + variant slug;
 * the seed step resolves them to ids via `SeedContext`.
 *
 * Every row is seeded with `isSeeded=true` so the conversions CRUD UI
 * blocks accidental deletes (`SeededRowProtected` typed error).
 */

export interface UnitConversionFixture {
  fromUnit: string;
  toUnit: 'g' | 'ml' | 'count';
  ratio: number;
  notes?: string;
}

export const UNIT_CONVERSION_FIXTURES: readonly UnitConversionFixture[] = [
  // Weight
  { fromUnit: 'kg', toUnit: 'g', ratio: 1000, notes: 'SI kilogram → gram.' },
  { fromUnit: 'mg', toUnit: 'g', ratio: 0.001, notes: 'SI milligram → gram.' },
  { fromUnit: 'oz', toUnit: 'g', ratio: 28.3495, notes: 'Avoirdupois ounce.' },
  { fromUnit: 'lb', toUnit: 'g', ratio: 453.592, notes: 'Avoirdupois pound.' },
  // Volume
  { fromUnit: 'l', toUnit: 'ml', ratio: 1000, notes: 'SI litre → millilitre.' },
  { fromUnit: 'cl', toUnit: 'ml', ratio: 10, notes: 'SI centilitre.' },
  { fromUnit: 'fl-oz', toUnit: 'ml', ratio: 29.5735, notes: 'US fluid ounce.' },
  { fromUnit: 'cup', toUnit: 'ml', ratio: 240, notes: 'US/AU cup (240ml).' },
  { fromUnit: 'tbsp', toUnit: 'ml', ratio: 15, notes: 'Tablespoon.' },
  { fromUnit: 'tsp', toUnit: 'ml', ratio: 5, notes: 'Teaspoon.' },
  // Count aliases
  { fromUnit: 'each', toUnit: 'count', ratio: 1, notes: 'Singular alias for "count".' },
  { fromUnit: 'whole', toUnit: 'count', ratio: 1, notes: 'Alias used by recipe scrapers.' },
  { fromUnit: 'piece', toUnit: 'count', ratio: 1, notes: 'Alias used by recipe scrapers.' },
];

/**
 * Per-ingredient weight overrides. `variantSlug=null` is the null-variant
 * fallback row (applies to every variant of the ingredient unless a more
 * specific row exists).
 *
 * The seeded weights are deliberately small: enough to exercise the
 * variant-specific path (flour:plain, sugar:caster, salt:table) AND the
 * null-variant fallback (butter), without claiming authority over the
 * USDA/Open Food Facts datasets the seed leaves out of scope.
 */
export interface IngredientWeightFixture {
  ingredientSlug: string;
  variantSlug: string | null;
  unit: string;
  grams: number;
  notes?: string;
}

export const INGREDIENT_WEIGHT_FIXTURES: readonly IngredientWeightFixture[] = [
  // Solids — variant-specific
  {
    ingredientSlug: 'flour',
    variantSlug: 'plain',
    unit: 'cup',
    grams: 125,
    notes: 'AU/US cup of sifted plain flour ≈ 125g.',
  },
  {
    ingredientSlug: 'sugar',
    variantSlug: 'caster',
    unit: 'cup',
    grams: 220,
    notes: 'AU/US cup of caster sugar ≈ 220g.',
  },
  {
    ingredientSlug: 'sugar',
    variantSlug: 'brown',
    unit: 'cup',
    grams: 200,
    notes: 'Lightly packed.',
  },
  {
    ingredientSlug: 'salt',
    variantSlug: 'table',
    unit: 'tsp',
    grams: 6,
    notes: 'Fine table salt ≈ 6g/tsp.',
  },
  {
    ingredientSlug: 'salt',
    variantSlug: 'table',
    unit: 'tbsp',
    grams: 18,
    notes: 'Fine table salt ≈ 18g/tbsp.',
  },
  // Null-variant fallback
  {
    ingredientSlug: 'butter',
    variantSlug: null,
    unit: 'cup',
    grams: 227,
    notes: 'Falls back across all butter variants.',
  },
];
