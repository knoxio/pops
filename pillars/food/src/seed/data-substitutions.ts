/**
 * Substitution fixtures.
 *
 * Mix of global and recipe-scoped edges. Every context tag (savory, sweet,
 * baking, frying, dressing, marinade, garnish, vegan, dairy-free,
 * gluten-free) appears on at least one edge.
 */

export type FoodContextTag =
  | 'savory'
  | 'sweet'
  | 'baking'
  | 'frying'
  | 'dressing'
  | 'marinade'
  | 'garnish'
  | 'vegan'
  | 'dairy-free'
  | 'gluten-free';

export interface SubstitutionEndpointFixture {
  /** Set when this side points at a top-level ingredient. */
  ingredientSlug?: string;
  /** Compound `<ingredient-slug>:<variant-slug>` for variant-scoped sides. */
  variantOfIngredient?: string;
  variantSlug?: string;
}

export interface SubstitutionFixture {
  from: SubstitutionEndpointFixture;
  to: SubstitutionEndpointFixture;
  ratio?: number;
  contextTags: readonly FoodContextTag[];
  scope?: 'global' | 'recipe';
  /** Required when `scope === 'recipe'`. */
  recipeSlug?: string;
  notes?: string;
}

export const SUBSTITUTION_FIXTURES: readonly SubstitutionFixture[] = [
  // Dairy ↔ plant-based (covers vegan + dairy-free + frying + baking)
  {
    from: { ingredientSlug: 'butter' },
    to: { variantOfIngredient: 'olive-oil', variantSlug: 'extra-virgin' },
    ratio: 0.75,
    contextTags: ['savory', 'frying'],
    notes: '3/4 ratio when frying',
  },
  {
    from: { variantOfIngredient: 'milk', variantSlug: 'full-cream' },
    to: { variantOfIngredient: 'milk', variantSlug: 'oat' },
    ratio: 1.0,
    contextTags: ['vegan', 'dairy-free', 'baking'],
  },
  {
    from: { ingredientSlug: 'butter' },
    to: { variantOfIngredient: 'milk', variantSlug: 'oat' },
    ratio: 1.0,
    contextTags: ['vegan', 'dairy-free'],
    notes: 'Approximation; not 1:1 in baking',
  },
  // Sugar swaps (covers sweet + baking)
  {
    from: { variantOfIngredient: 'sugar', variantSlug: 'caster' },
    to: { variantOfIngredient: 'sugar', variantSlug: 'brown' },
    ratio: 1.0,
    contextTags: ['sweet', 'baking'],
  },
  // Flour (covers gluten-free)
  {
    from: { variantOfIngredient: 'flour', variantSlug: 'plain' },
    to: { variantOfIngredient: 'flour', variantSlug: 'bread' },
    ratio: 1.0,
    contextTags: ['baking'],
  },
  {
    from: { variantOfIngredient: 'flour', variantSlug: 'plain' },
    to: { variantOfIngredient: 'corn', variantSlug: 'frozen-kernels' },
    ratio: 0.5,
    contextTags: ['gluten-free', 'baking'],
    notes: 'Corn-based thickener swap; only sensible in some bakes',
  },
  // Protein (covers marinade + savory)
  {
    from: { variantOfIngredient: 'beef', variantSlug: 'mince' },
    to: { variantOfIngredient: 'chicken', variantSlug: 'mince' },
    ratio: 1.0,
    contextTags: ['savory', 'marinade'],
  },
  // Cheese (covers garnish)
  {
    from: { variantOfIngredient: 'cheese', variantSlug: 'parmesan-grated' },
    to: { variantOfIngredient: 'cheese', variantSlug: 'cheddar-shredded' },
    ratio: 1.0,
    contextTags: ['garnish', 'savory'],
  },
  // Onion (covers dressing)
  {
    from: { variantOfIngredient: 'onion', variantSlug: 'yellow' },
    to: { variantOfIngredient: 'onion', variantSlug: 'red' },
    ratio: 1.0,
    contextTags: ['dressing', 'savory'],
  },
  // Recipe-scoped — pinned to the smash-burger fixture recipe so the seeder
  // exercises the `scope='recipe'` path.
  {
    from: { variantOfIngredient: 'cheese', variantSlug: 'cheddar-shredded' },
    to: { variantOfIngredient: 'cheese', variantSlug: 'colby-block' },
    ratio: 1.0,
    contextTags: ['savory'],
    scope: 'recipe',
    recipeSlug: 'smash-burger',
    notes: 'Smash-burger override: colby beats cheddar for melt',
  },
];
