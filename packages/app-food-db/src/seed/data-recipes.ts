/**
 * PRD-113 fixture set — recipe headers (phase 1: uncompiled DSL).
 *
 * Phase 1 stores the DSL body verbatim and leaves `recipe_versions.status =
 * 'draft'` + `compile_state` uncompiled. Phase 2 (post PRD-116) replaces
 * `seedRecipeHeaders` with a `seedRecipesAndCompile()` that invokes
 * `compileRecipeVersion` so `recipe_lines` / `recipe_steps` get populated —
 * that's the cross-PRD smoke test PRD-113 originally specced.
 *
 * The DSL bodies below are deliberately shaped to exercise the resolver's
 * variant scoping (`onion:yellow`), alias resolution (`evoo`), recipe-as-
 * ingredient refs (smash-burger consumes a beef:patty produced by another
 * cook), and the yield form. Keeping them around now means phase 2 doesn't
 * have to author them from scratch.
 */

export interface RecipeFixture {
  slug: string;
  recipeType?: 'plate' | 'component' | 'technique' | 'sauce' | 'dressing' | 'drink' | 'condiment';
  title: string;
  summary?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  bodyDsl: string;
}

const SMASH_BURGER_DSL = `@title Smash burger
@yield(beef:mince:cooked, 360:g)

@step prep "Smash"
  @ingredient beef:mince 600:g
  @ingredient salt 4:g
  @ingredient pepper:black-ground 2:g

@step cook "Sear"
  @ingredient evoo 10:ml

@step assemble "Build"
  @ingredient bread:burger-bun 4:count
  @ingredient cheese:cheddar-shredded 80:g
  @ingredient onion:yellow 1:count
  @ingredient tomato:beefsteak 1:count
`;

const WEEKNIGHT_PASTA_DSL = `@title Weeknight pasta
@yield(flour:plain:cooked, 800:g)

@step prep "Mise"
  @ingredient flour:plain 400:g
  @ingredient garlic:peeled-clove 4:count
  @ingredient tomato:canned-whole 800:g

@step cook "Simmer"
  @ingredient evoo 30:ml
  @ingredient salt:table 8:g
  @ingredient pepper:black-ground 2:g

@step plate "Plate"
  @ingredient parsley:flat-leaf 10:g
  @ingredient cheese:parmesan-grated 40:g
`;

const ROAST_CHICKEN_DSL = `@title Roast chicken
@yield(chicken:whole:roasted, 1600:g)

@step prep "Brine"
  @ingredient chicken:whole 1.8:kg
  @ingredient salt:flaky 30:g

@step cook "Roast"
  @ingredient butter:unsalted 50:g
  @ingredient lemon 1:count
  @ingredient parsley:flat-leaf 20:g

@step rest "Carve"
  @ingredient pepper:black-ground 3:g
`;

const BREAKFAST_EGGS_DSL = `@title Breakfast eggs

@step cook "Scramble"
  @ingredient egg:large 3:count
  @ingredient butter:unsalted 20:g
  @ingredient milk:full-cream 30:ml

@step plate "Serve"
  @ingredient bread:sourdough-loaf 2:count
  @ingredient salt:table 1:g
  @ingredient pepper:black-ground 1:g
`;

export const RECIPE_FIXTURES: readonly RecipeFixture[] = [
  {
    slug: 'smash-burger',
    recipeType: 'plate',
    title: 'Smash burger',
    summary: 'Cast-iron, crusty edges, simple toppings.',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 15,
    bodyDsl: SMASH_BURGER_DSL,
  },
  {
    slug: 'weeknight-pasta',
    recipeType: 'plate',
    title: 'Weeknight pasta',
    summary: 'Fast tomato sauce; pantry friendly.',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 25,
    bodyDsl: WEEKNIGHT_PASTA_DSL,
  },
  {
    slug: 'roast-chicken',
    recipeType: 'plate',
    title: 'Roast chicken',
    summary: 'Sunday roast; carcass becomes Monday stock.',
    servings: 6,
    prepMinutes: 20,
    cookMinutes: 90,
    bodyDsl: ROAST_CHICKEN_DSL,
  },
  {
    slug: 'breakfast-eggs',
    recipeType: 'plate',
    title: 'Breakfast eggs',
    summary: 'Three eggs, sourdough, no fuss.',
    servings: 1,
    prepMinutes: 2,
    cookMinutes: 5,
    bodyDsl: BREAKFAST_EGGS_DSL,
  },
];
