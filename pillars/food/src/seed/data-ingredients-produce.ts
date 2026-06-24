/**
 * Ingredient + variant fixtures (part 2: produce + bread).
 *
 * Hosts the depth-2 hierarchy (tomato → roma + cherry; potato → desiree) and
 * the per-variant shelf-life overrides for corn (fresh-cob vs canned vs
 * frozen).
 */
import type { IngredientFixture } from './types-ingredient.js';

export const INGREDIENT_FIXTURES_PRODUCE_AND_BREAD: readonly IngredientFixture[] = [
  {
    name: 'Onion',
    slug: 'onion',
    defaultUnit: 'count',
    shelfLifeDaysFridge: 14,
    variants: [
      { name: 'Yellow', slug: 'yellow' },
      { name: 'Red', slug: 'red' },
      { name: 'Spring', slug: 'spring' },
    ],
  },
  {
    name: 'Garlic',
    slug: 'garlic',
    defaultUnit: 'count',
    shelfLifeDaysFridge: 30,
    variants: [
      { name: 'Whole head', slug: 'whole-head' },
      { name: 'Peeled clove', slug: 'peeled-clove' },
    ],
  },
  {
    name: 'Tomato',
    slug: 'tomato',
    defaultUnit: 'count',
    shelfLifeDaysFridge: 7,
    variants: [
      { name: 'Beefsteak', slug: 'beefsteak' },
      { name: 'Canned whole', slug: 'canned-whole', shelfLifeDaysFridge: 365 },
      { name: 'Canned diced', slug: 'canned-diced', shelfLifeDaysFridge: 365 },
    ],
    children: [
      {
        name: 'Roma tomato',
        slug: 'roma-tomato',
        defaultUnit: 'count',
        shelfLifeDaysFridge: 7,
        variants: [{ name: 'Standard', slug: 'standard' }],
      },
      {
        name: 'Cherry tomato',
        slug: 'cherry-tomato',
        defaultUnit: 'count',
        shelfLifeDaysFridge: 7,
        variants: [{ name: 'Standard', slug: 'standard' }],
      },
    ],
  },
  {
    name: 'Potato',
    slug: 'potato',
    defaultUnit: 'count',
    shelfLifeDaysFridge: 30,
    variants: [
      { name: 'Royal blue', slug: 'royal-blue' },
      { name: 'Kipfler', slug: 'kipfler' },
    ],
    children: [
      {
        name: 'Desiree potato',
        slug: 'desiree-potato',
        defaultUnit: 'count',
        shelfLifeDaysFridge: 30,
        variants: [{ name: 'Standard', slug: 'standard' }],
      },
    ],
  },
  {
    name: 'Carrot',
    slug: 'carrot',
    defaultUnit: 'count',
    shelfLifeDaysFridge: 21,
    variants: [
      { name: 'Standard', slug: 'standard' },
      { name: 'Baby', slug: 'baby' },
    ],
  },
  {
    name: 'Lemon',
    slug: 'lemon',
    defaultUnit: 'count',
    shelfLifeDaysFridge: 14,
    variants: [{ name: 'Standard', slug: 'standard' }],
  },
  {
    name: 'Corn',
    slug: 'corn',
    defaultUnit: 'count',
    variants: [
      { name: 'Fresh cob', slug: 'fresh-cob', shelfLifeDaysFridge: 5 },
      { name: 'Canned brine', slug: 'canned-brine', shelfLifeDaysFridge: 365 },
      { name: 'Frozen kernels', slug: 'frozen-kernels', shelfLifeDaysFreezer: 365 },
    ],
  },
  {
    name: 'Parsley',
    slug: 'parsley',
    defaultUnit: 'g',
    shelfLifeDaysFridge: 7,
    variants: [
      { name: 'Flat leaf', slug: 'flat-leaf' },
      { name: 'Curly', slug: 'curly' },
    ],
  },
  {
    name: 'Bread',
    slug: 'bread',
    defaultUnit: 'count',
    shelfLifeDaysFridge: 7,
    shelfLifeDaysFreezer: 90,
    variants: [
      { name: 'Sourdough loaf', slug: 'sourdough-loaf' },
      { name: 'Burger bun', slug: 'burger-bun' },
      { name: 'Flatbread', slug: 'flatbread' },
    ],
  },
];
