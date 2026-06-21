/**
 * Fixtures shared across PRD-121 renderer tests.
 *
 * Each fixture is built like the compile pipeline would emit it — `body_md`
 * is the rewritten markdown with structural anchors, `body_resolved_json`
 * is the matching serialised `ResolvedStepBody`. The two pieces are kept
 * in lockstep manually here so each test exercises a specific drift /
 * happy-path / edge case.
 *
 * `makeRecipeData` lets each test override individual slices without
 * restating the full payload — keeps the test file readable.
 */
import type {
  RecipeLineWithResolved,
  RecipeVersionWithCompiledData,
  ResolvedStepBody,
} from '../recipe-render-types.js';

const BASE_RECIPE = {
  id: 1,
  slug: 'banana-pancakes',
  recipeType: 'plate' as const,
  currentVersionId: 10,
  heroImagePath: 'recipes/banana-pancakes/hero.webp',
  archivedAt: null,
  createdAt: '2026-06-01T00:00:00Z',
};

const BASE_VERSION = {
  id: 10,
  recipeId: 1,
  versionNo: 1,
  status: 'current' as const,
  title: 'Banana pancakes',
  summary: 'Quick weekday breakfast.',
  bodyDsl: '(unused by renderer)',
  yieldIngredientId: 100,
  yieldVariantId: null,
  yieldPrepStateId: null,
  yieldQty: 4,
  yieldUnit: 'count',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 15,
  sourceId: null,
  compileStatus: 'compiled' as const,
  compileError: null,
  compiledAt: '2026-06-02T12:00:00Z',
  createdAt: '2026-06-01T00:00:00Z',
};

export const ingredientBanana = {
  id: 200,
  parentId: null,
  name: 'Banana',
  slug: 'banana',
  defaultUnit: 'count' as const,
  densityGPerMl: null,
  notes: null,
  createdAt: '2026-06-01T00:00:00Z',
};

export const ingredientButter = {
  id: 201,
  parentId: null,
  name: 'Butter',
  slug: 'butter',
  defaultUnit: 'g' as const,
  densityGPerMl: null,
  notes: null,
  createdAt: '2026-06-01T00:00:00Z',
};

export const yieldIngredientPancake = {
  id: 100,
  parentId: null,
  name: 'Pancake',
  slug: 'pancake',
  defaultUnit: 'count' as const,
  densityGPerMl: null,
  notes: null,
  createdAt: '2026-06-01T00:00:00Z',
};

export function makeLine(overrides: Partial<RecipeLineWithResolved> = {}): RecipeLineWithResolved {
  return {
    id: 1,
    position: 1,
    ingredientId: ingredientBanana.id,
    variantId: null,
    prepStateId: null,
    isRecipeRef: false,
    recipeRefId: null,
    originalText: 'banana',
    originalQty: 250,
    originalUnit: 'g',
    qtyG: 250,
    qtyMl: null,
    qtyCount: null,
    canonicalUnit: 'g',
    optional: false,
    notes: null,
    ingredientName: ingredientBanana.name,
    ingredientSlug: ingredientBanana.slug,
    variantName: null,
    variantSlug: null,
    prepStateName: null,
    prepStateSlug: null,
    recipeRefSlug: null,
    recipeRefTitle: null,
    ...overrides,
  };
}

/**
 * Default compiled payload with two ingredient lines + one step containing
 * an ingredient chip and a 2-minute timer. Tests override the slices they
 * exercise.
 */
export function makeRecipeData(
  overrides: Partial<RecipeVersionWithCompiledData> = {}
): RecipeVersionWithCompiledData {
  const bodyResolved: ResolvedStepBody = [
    { kind: 'text', value: 'Melt the ' },
    {
      kind: 'ref',
      ingredientIndex: 2,
      ingredientId: ingredientButter.id,
      variantId: null,
      prepStateId: null,
    },
    { kind: 'text', value: ' and wait ' },
    { kind: 'time', qty: { qty: 2, unit: 'min' } },
    { kind: 'text', value: '.' },
  ];

  return {
    recipe: { ...BASE_RECIPE },
    version: { ...BASE_VERSION },
    lines: [
      makeLine({ id: 1, position: 1, ingredientName: 'Banana' }),
      makeLine({
        id: 2,
        position: 2,
        ingredientId: ingredientButter.id,
        ingredientName: 'Butter',
        ingredientSlug: ingredientButter.slug,
        originalText: 'butter',
        originalQty: 10,
        canonicalUnit: 'g',
        qtyG: 10,
      }),
    ],
    steps: [
      {
        id: 1,
        recipeVersionId: BASE_VERSION.id,
        position: 1,
        bodyMd: 'Melt the [butter](#line-2) and wait [2 min](#timer).',
        bodyResolvedJson: JSON.stringify(bodyResolved),
        durationMinutes: null,
        temperatureValue: null,
        temperatureUnit: 'c',
      },
    ],
    yieldIngredient: yieldIngredientPancake,
    yieldVariant: null,
    yieldPrepState: null,
    tags: ['breakfast', 'quick'],
    ...overrides,
  };
}
