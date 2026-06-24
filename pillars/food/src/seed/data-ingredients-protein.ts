/**
 * Ingredient + variant fixtures (part 3: proteins).
 *
 * Tight fridge windows (2d) + freezer extensions (90-180d) — primary input
 * to the `expires_at` auto-fill in seeded batches.
 */
import type { IngredientFixture } from './types-ingredient.js';

export const INGREDIENT_FIXTURES_PROTEIN: readonly IngredientFixture[] = [
  {
    name: 'Chicken',
    slug: 'chicken',
    defaultUnit: 'g',
    shelfLifeDaysFridge: 2,
    shelfLifeDaysFreezer: 90,
    variants: [
      { name: 'Breast', slug: 'breast' },
      { name: 'Thigh', slug: 'thigh' },
      { name: 'Whole', slug: 'whole' },
      { name: 'Mince', slug: 'mince' },
    ],
  },
  {
    name: 'Beef',
    slug: 'beef',
    defaultUnit: 'g',
    shelfLifeDaysFridge: 2,
    shelfLifeDaysFreezer: 180,
    variants: [
      { name: 'Chuck', slug: 'chuck' },
      { name: 'Mince', slug: 'mince' },
      { name: 'Ribeye', slug: 'ribeye' },
    ],
  },
];

export const ALL_INGREDIENT_GROUPS_PROTEIN = INGREDIENT_FIXTURES_PROTEIN;
