/**
 * 11 sample recipes covering the grammar's positive surface — PRD-114 AC.
 *
 * Duplicated from the food pillar's `src/dsl/__tests__/samples.ts`. The
 * canonical copy lives there alongside the parser tests; this copy stays
 * here because the Lezer parity test (which stays in app-food alongside
 * the Lezer grammar) needs the same fixtures and importing test files
 * across workspace boundaries would require exporting test data through
 * the public package barrel.
 */

export const SIMPLE_PLATE = `@recipe(
  slug="grilled-cheese",
  title="Grilled Cheese"
)
@yield(grilled-cheese, 1:count)
@ingredient(1, bread, 2:count)
@ingredient(2, butter, 10:g)
@ingredient(3, cheddar, 60:g)
@step("Butter the @1 on the outside.")
@step("Lay @3 on the unbuttered side and assemble.")
@step("Grill on medium-low for @time(4:min) per side.")
`;

export const COMPONENT_WITH_YIELD = `@recipe(
  slug="smash-patty",
  title="Smash Patty",
  recipe_type="component"
)
@yield(smash-patty, 1:count)
@ingredient(1, chuck:_:coarse-ground, 100:g)
@step("Roll @1 into a loose ball; press flat with a spatula over @temperature(220:c).")
`;

export const RECIPE_REFERENCING_RECIPE = `@recipe(slug="cheeseburger", title="Cheeseburger")
@yield(cheeseburger, 1:count)
@ingredient(1, brioche-bun, 1:count)
@ingredient(2, smash-patty, 2:count)
@ingredient(3, cheddar, 30:g)
@step("Stack @2 with @3 on @1.")
`;

export const OPTIONAL_INGREDIENT = `@recipe(slug="aglio-e-olio", title="Aglio e Olio")
@yield(aglio-e-olio, 2:count)
@ingredient(1, spaghetti, 200:g)
@ingredient(2, garlic, 4:count)
@ingredient(3, chili-flakes, 1:g, optional=true)
@step("Cook @1 al dente.")
@step("Bloom @2 and @3 in olive oil over @temperature(160:c).")
`;

export const INTERSPERSED_MARKDOWN = `@recipe(slug="dal", title="Dal")
@yield(dal, 4:count)

## Ingredients
@ingredient(1, red-lentils, 200:g)
@ingredient(2, ginger, 10:g)

## Method
Make sure to rinse the lentils first.

@step("Rinse @1 until the water runs clear.")
@step("Sauté @2, then add @1 and water; simmer for @time(20:min).")
`;

export const INLINE_TIME_TEMPERATURE = `@recipe(slug="caramel", title="Caramel")
@yield(caramel, 200:g)
@ingredient(1, sugar, 200:g)
@step("Heat @1 in a dry pan to @temperature(170:c) for @time(8:min), swirling.")
`;

export const MULTILINE_RECIPE_HEADER = `@recipe(
  slug="multi-line",
  title="Multi-line header",
  servings=2,
  prep_time=10:min,
  cook_time=20:min,
  recipe_type="plate",
  summary="Demonstrates the multi-line @recipe(...) form."
)
@yield(multi-line-out, 2:count)
@ingredient(1, rice, 300:g)
@step("Cook @1.")
`;

export const WITH_COMMENTS = `// Pulled from a paper recipe card.
@recipe(slug="banana-bread", title="Banana Bread")
// yield is 1 loaf
@yield(banana-bread, 1:count)
@ingredient(1, banana:_:mashed, 250:g)
@step("Bake the @1 mixture at @temperature(180:c) for @time(45:min).")
`;

export const NAMED_INGREDIENT_FORM = `@recipe(slug="hummus", title="Hummus")
@yield(hummus, 300:g)
@ingredient(1, chickpea, variant=cooked, qty=240, unit=g, notes="drain reserved liquid")
@step("Blend @1 with lemon juice and tahini.")
`;

export const COMPACT_SKIP_DESCRIPTOR = `@recipe(slug="pesto", title="Pesto")
@yield(pesto, 200:g)
@ingredient(1, basil:_:chopped, 60:g)
@ingredient(2, parmesan:_:grated, 40:g)
@step("Pound @1 with @2 in a mortar.")
`;

export const NON_YIELDING_TECHNIQUE = `@recipe(slug="blanch", title="Blanching", recipe_type="technique")
@yield(none, 0:none)
@ingredient(1, vegetable, 200:g)
@step("Drop @1 into salted boiling water for @time(60:s), then shock in ice water.")
`;

/** Round-trip sample list for the printer test. */
export const ALL_SAMPLES = [
  ['simple plate', SIMPLE_PLATE],
  ['component with yield', COMPONENT_WITH_YIELD],
  ['recipe referencing recipe', RECIPE_REFERENCING_RECIPE],
  ['optional ingredient', OPTIONAL_INGREDIENT],
  ['interspersed markdown', INTERSPERSED_MARKDOWN],
  ['inline time + temperature', INLINE_TIME_TEMPERATURE],
  ['multi-line @recipe header', MULTILINE_RECIPE_HEADER],
  ['with comments', WITH_COMMENTS],
  ['named @ingredient form', NAMED_INGREDIENT_FORM],
  ['compact `_`-skip descriptor', COMPACT_SKIP_DESCRIPTOR],
  ['non-yielding technique', NON_YIELDING_TECHNIQUE],
] as const;
