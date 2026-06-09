/**
 * PRD-113 fixture set — recipe headers + DSL bodies (phases 1 + 2).
 *
 * Phase 1 stores these bodies verbatim and leaves `recipe_versions.status =
 * 'draft'` + `compile_status = 'uncompiled'`. Phase 2 (post PRD-116) drives
 * `compileRecipeVersion` against each row so `recipe_lines` / `recipe_steps`
 * get populated and the version is promoted to `current` — the cross-PRD
 * smoke test PRD-113 was originally specced as.
 *
 * The DSL bodies follow PRD-114's grammar exactly:
 *
 *   - `@recipe(slug, title, recipe_type?, servings?, prep_time?, cook_time?)`
 *   - `@yield(<ingredient-slug>, qty:unit)` — yield slugs that don't match
 *     the seeded ingredient list are auto-created by PRD-115 → PRD-116.
 *   - `@ingredient(N, head:variant:prep, qty:unit, optional?, notes?)` — both
 *     compact and named-arg forms.
 *   - `@step("body")` with inline `@N`, `@time(...)`, `@temperature(...)`.
 *
 * Fixture order matters: components first (so PRD-115's recipe-as-ingredient
 * resolution finds a promoted `current_version_id`), then plates that
 * reference them.
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

const SMASH_PATTY_DSL = `@recipe(
  slug="smash-patty",
  title="Smash Patty",
  recipe_type="component",
  servings=4,
  prep_time=5:min,
  cook_time=10:min
)
@yield(beef-patty-cooked, 4:count)
@ingredient(1, beef:mince, 500:g)
@ingredient(2, salt:flaky, 5:g)
@ingredient(3, pepper:black-ground, 2:g)
@step("Divide @1 into 4 loose balls and season with @2 and @3.")
@step("Heat a heavy pan over high heat until smoking.")
@step("Press flat and sear @time(2:min) per side at @temperature(220:c).")
`;

const SMASH_BURGER_DSL = `@recipe(
  slug="smash-burger",
  title="Smash burger",
  servings=4,
  prep_time=5:min,
  cook_time=5:min
)
@yield(smash-burger-served, 4:count)
@ingredient(1, bread:burger-bun, 4:count)
@ingredient(2, smash-patty, 4:count)
@ingredient(3, cheese:colby-block, 4:count)
@ingredient(4, onion:yellow:sliced, 1:count)
@ingredient(5, tomato:beefsteak, 1:count)
@step("Toast the @1 in the pan over @temperature(180:c).")
@step("Place @3 on each @2 to melt while still hot.")
@step("Assemble: bottom of @1, @2 with @3, @4, @5, top of @1.")
`;

const WEEKNIGHT_PASTA_DSL = `@recipe(
  slug="weeknight-pasta",
  title="Weeknight pasta",
  servings=4,
  prep_time=10:min,
  cook_time=25:min
)
@yield(pasta-plate, 4:count)
@ingredient(1, flour:plain, 400:g)
@ingredient(2, garlic:peeled-clove, 4:count)
@ingredient(3, tomato:canned-whole, 800:g)
@ingredient(4, olive-oil:extra-virgin, 30:ml)
@ingredient(5, salt:table, 2:tsp)
@ingredient(6, pepper:black-ground, 2:g)
@ingredient(7, parsley:flat-leaf, 10:g)
@ingredient(8, cheese:parmesan-grated, 40:g)
@step("Boil @1 in salted water until al dente, @time(10:min).")
@step("Crush @2 and bloom in @4 over low heat for @time(2:min).")
@step("Add @3 and simmer @time(15:min) at @temperature(180:c). Season with @5 and @6.")
@step("Toss the pasta into the sauce; plate with @7 and @8.")
`;

const ROAST_CHICKEN_DSL = `@recipe(
  slug="roast-chicken",
  title="Roast chicken",
  servings=6,
  prep_time=20:min,
  cook_time=90:min
)
@yield(roast-chicken-meat, 1600:g)
@ingredient(1, chicken:whole, 1.8:kg)
@ingredient(2, salt:flaky, 30:g)
@ingredient(3, butter:unsalted, 50:g)
@ingredient(4, lemon, 1:count)
@ingredient(5, parsley:flat-leaf, 20:g)
@ingredient(6, pepper:black-ground, 3:g)
@step("Brine @1 with @2 for @time(60:min).")
@step("Rub @3 under the skin; stuff the cavity with @4.")
@step("Roast at @temperature(200:c) for @time(90:min) until juices run clear.")
@step("Rest, then carve and season with @6 and @5.")
`;

const BREAKFAST_EGGS_DSL = `@recipe(
  slug="breakfast-eggs",
  title="Breakfast eggs",
  servings=1,
  prep_time=2:min,
  cook_time=5:min
)
@yield(scrambled-eggs, 1:count)
@ingredient(1, egg, variant=large, qty=3, unit=count)
@ingredient(2, butter, variant=unsalted, qty=20, unit=g)
@ingredient(3, milk, variant=full-cream, qty=30, unit=ml)
@ingredient(4, bread:sourdough-loaf:sliced, 2:count)
@ingredient(5, salt:table, 1:g)
@ingredient(6, pepper:black-ground, 1:g)
@step("Whisk @1 in a bowl and season with @5 and @6.")
@step("Melt @2 in a non-stick pan over @temperature(160:c).")
@step("Pour @1 in and stir gently for @time(90:s); add @3 to slow the cook.")
@step("Toast @4 and serve alongside.")
`;

export const RECIPE_FIXTURES: readonly RecipeFixture[] = [
  {
    slug: 'smash-patty',
    recipeType: 'component',
    title: 'Smash patty',
    summary: 'Component recipe — the patty smash-burger composes with.',
    servings: 4,
    prepMinutes: 5,
    cookMinutes: 10,
    bodyDsl: SMASH_PATTY_DSL,
  },
  {
    slug: 'smash-burger',
    recipeType: 'plate',
    title: 'Smash burger',
    summary: 'Cast-iron, crusty edges, simple toppings.',
    servings: 4,
    prepMinutes: 5,
    cookMinutes: 5,
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
    summary: 'Three eggs, sourdough, no fuss. Uses the named-arg DSL form.',
    servings: 1,
    prepMinutes: 2,
    cookMinutes: 5,
    bodyDsl: BREAKFAST_EGGS_DSL,
  },
];
