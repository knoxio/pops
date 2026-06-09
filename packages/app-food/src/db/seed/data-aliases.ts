/**
 * PRD-113 fixture set — ingredient aliases.
 *
 * Targets either an ingredient or a variant. Exactly one of `ingredientSlug`
 * / `variantOfIngredient` must be set; variant aliases scope under their
 * parent ingredient. The seeder persists `source = 'user'` (PRD-106's enum
 * is `user | llm | ingest`; there's no `seed` value, and `user` is the
 * closest fit for human-curated rows that pre-populate the dev DB).
 */

export interface AliasFixture {
  alias: string;
  /** Set when the alias points at a top-level ingredient. */
  ingredientSlug?: string;
  /** Set when the alias points at a variant. Combined with `variantSlug`. */
  variantOfIngredient?: string;
  variantSlug?: string;
}

export const ALIAS_FIXTURES: readonly AliasFixture[] = [
  // Onion family
  { alias: 'scallion', variantOfIngredient: 'onion', variantSlug: 'spring' },
  { alias: 'spring onion', variantOfIngredient: 'onion', variantSlug: 'spring' },
  { alias: 'green onion', variantOfIngredient: 'onion', variantSlug: 'spring' },
  { alias: 'shallot', variantOfIngredient: 'onion', variantSlug: 'spring' },

  // Olive oil
  { alias: 'evoo', variantOfIngredient: 'olive-oil', variantSlug: 'extra-virgin' },
  { alias: 'evo', variantOfIngredient: 'olive-oil', variantSlug: 'extra-virgin' },
  { alias: 'xv olive oil', variantOfIngredient: 'olive-oil', variantSlug: 'extra-virgin' },

  // Tomato
  { alias: 'passata', variantOfIngredient: 'tomato', variantSlug: 'canned-whole' },
  { alias: 'tinned tomato', variantOfIngredient: 'tomato', variantSlug: 'canned-whole' },
  { alias: 'crushed tomato', variantOfIngredient: 'tomato', variantSlug: 'canned-diced' },

  // Egg
  { alias: 'eggs', ingredientSlug: 'egg' },

  // Chicken
  { alias: 'chook', ingredientSlug: 'chicken' },
  { alias: 'chook breast', variantOfIngredient: 'chicken', variantSlug: 'breast' },
  { alias: 'chicken mince', variantOfIngredient: 'chicken', variantSlug: 'mince' },
  { alias: 'ground chicken', variantOfIngredient: 'chicken', variantSlug: 'mince' },

  // Beef
  { alias: 'mince', variantOfIngredient: 'beef', variantSlug: 'mince' },
  { alias: 'ground beef', variantOfIngredient: 'beef', variantSlug: 'mince' },
  { alias: 'hamburger', variantOfIngredient: 'beef', variantSlug: 'mince' },

  // Cheese
  { alias: 'parmesan', variantOfIngredient: 'cheese', variantSlug: 'parmesan-grated' },
  { alias: 'parmigiano', variantOfIngredient: 'cheese', variantSlug: 'parmesan-grated' },
  { alias: 'cheddar', variantOfIngredient: 'cheese', variantSlug: 'cheddar-shredded' },

  // Sugar
  { alias: 'powdered sugar', variantOfIngredient: 'sugar', variantSlug: 'icing' },
  { alias: 'confectioners sugar', variantOfIngredient: 'sugar', variantSlug: 'icing' },

  // Flour
  { alias: 'all-purpose flour', variantOfIngredient: 'flour', variantSlug: 'plain' },
  { alias: 'ap flour', variantOfIngredient: 'flour', variantSlug: 'plain' },

  // Salt
  { alias: 'kosher salt', variantOfIngredient: 'salt', variantSlug: 'flaky' },
  { alias: 'sea salt', variantOfIngredient: 'salt', variantSlug: 'flaky' },

  // Bread
  { alias: 'sourdough', variantOfIngredient: 'bread', variantSlug: 'sourdough-loaf' },
  { alias: 'bun', variantOfIngredient: 'bread', variantSlug: 'burger-bun' },

  // Parsley
  { alias: 'italian parsley', variantOfIngredient: 'parsley', variantSlug: 'flat-leaf' },

  // Lemon
  { alias: 'lemons', ingredientSlug: 'lemon' },
];
