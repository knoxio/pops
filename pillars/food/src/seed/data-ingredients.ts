/**
 * Ingredient + variant fixtures (part 1: shelf-stable + dairy + eggs).
 *
 * Spans (default_unit × variants × shelf_life). Pantry items (salt, pepper,
 * sugar, flour) leave shelf-life NULL; dairy + eggs carry fridge defaults.
 * Per-ingredient shelf-life defaults propagate to variants unless overridden.
 */
import type { IngredientFixture } from './types-ingredient.js';

export const INGREDIENT_FIXTURES_PANTRY_AND_DAIRY: readonly IngredientFixture[] = [
  {
    name: 'Salt',
    slug: 'salt',
    defaultUnit: 'g',
    notes: 'Shelf-stable',
    variants: [
      { name: 'Table', slug: 'table' },
      { name: 'Flaky', slug: 'flaky' },
    ],
  },
  {
    name: 'Pepper',
    slug: 'pepper',
    defaultUnit: 'g',
    notes: 'Shelf-stable',
    variants: [
      { name: 'Black ground', slug: 'black-ground' },
      { name: 'White ground', slug: 'white-ground' },
      { name: 'Pink whole', slug: 'pink-whole' },
    ],
  },
  {
    name: 'Olive oil',
    slug: 'olive-oil',
    defaultUnit: 'ml',
    densityGPerMl: 0.91,
    variants: [
      { name: 'Extra virgin', slug: 'extra-virgin' },
      { name: 'Light', slug: 'light' },
    ],
  },
  {
    name: 'Butter',
    slug: 'butter',
    defaultUnit: 'g',
    shelfLifeDaysFridge: 30,
    shelfLifeDaysFreezer: 365,
    variants: [
      { name: 'Unsalted', slug: 'unsalted' },
      { name: 'Salted', slug: 'salted' },
      { name: 'Cultured', slug: 'cultured' },
    ],
  },
  {
    name: 'Egg',
    slug: 'egg',
    defaultUnit: 'count',
    shelfLifeDaysFridge: 21,
    variants: [
      { name: 'Large', slug: 'large' },
      { name: 'Medium', slug: 'medium' },
      { name: 'Small', slug: 'small' },
    ],
  },
  {
    name: 'Flour',
    slug: 'flour',
    defaultUnit: 'g',
    variants: [
      { name: 'Plain', slug: 'plain' },
      { name: 'Bread', slug: 'bread' },
      { name: 'Self-raising', slug: 'self-raising' },
    ],
  },
  {
    name: 'Sugar',
    slug: 'sugar',
    defaultUnit: 'g',
    variants: [
      { name: 'Caster', slug: 'caster' },
      { name: 'Brown', slug: 'brown' },
      { name: 'Icing', slug: 'icing' },
    ],
  },
  {
    name: 'Milk',
    slug: 'milk',
    defaultUnit: 'ml',
    densityGPerMl: 1.03,
    shelfLifeDaysFridge: 7,
    variants: [
      { name: 'Full cream', slug: 'full-cream' },
      { name: 'Skim', slug: 'skim' },
      { name: 'Oat', slug: 'oat' },
    ],
  },
  {
    name: 'Cheese',
    slug: 'cheese',
    defaultUnit: 'g',
    shelfLifeDaysFridge: 30,
    variants: [
      { name: 'Colby block', slug: 'colby-block' },
      { name: 'Cheddar shredded', slug: 'cheddar-shredded' },
      { name: 'Parmesan grated', slug: 'parmesan-grated' },
    ],
  },
];
