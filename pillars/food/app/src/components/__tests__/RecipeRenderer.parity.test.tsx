/**
 * Round-trip parity test.
 *
 * Feeds a static `RecipeVersionWithCompiledData` fixture (typed from the
 * `recipes.getForRendering` wire response) to `RecipeRenderer` and asserts
 * the rendered DOM contains the structural elements a compiled recipe
 * emits: an ingredient row per `recipe_lines` row, step bodies with the
 * right number of substituted chips / timers / temps, and an assembled
 * yield label.
 *
 * The payload was captured from the compile pipeline's output and inlined
 * so the renderer test stays pure presentation — no DSL compile, no
 * in-memory `FoodDb`, no DB round-trip.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RecipeRenderer } from '../RecipeRenderer';

import type { RecipeVersionWithCompiledData, ResolvedStepBody } from '../recipe-render-types.js';

function step(args: {
  id: number;
  position: number;
  bodyMd: string;
  bodyResolved: ResolvedStepBody;
}): RecipeVersionWithCompiledData['steps'][number] {
  return {
    id: args.id,
    recipeVersionId: 10,
    position: args.position,
    bodyMd: args.bodyMd,
    bodyResolvedJson: JSON.stringify(args.bodyResolved),
    durationMinutes: null,
    temperatureValue: null,
    temperatureUnit: 'c',
  };
}

const PANCAKES: RecipeVersionWithCompiledData = {
  recipe: {
    id: 1,
    slug: 'parity-pancakes',
    recipeType: 'plate',
    currentVersionId: 10,
    heroImagePath: null,
    archivedAt: null,
    createdAt: '2026-06-01T00:00:00Z',
  },
  version: {
    id: 10,
    recipeId: 1,
    versionNo: 1,
    status: 'current',
    title: 'Parity pancakes',
    summary: null,
    bodyDsl: '(unused by renderer)',
    yieldIngredientId: 100,
    yieldVariantId: null,
    yieldPrepStateId: null,
    yieldQty: 4,
    yieldUnit: 'count',
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 10,
    sourceId: null,
    compileStatus: 'compiled',
    compileError: null,
    compiledAt: '2026-06-02T12:00:00Z',
    createdAt: '2026-06-01T00:00:00Z',
  },
  lines: [
    makeLine({ id: 1, position: 1, ingredientName: 'Banana', ingredientSlug: 'banana' }),
    makeLine({
      id: 2,
      position: 2,
      ingredientId: 201,
      ingredientName: 'Butter',
      ingredientSlug: 'butter',
      originalText: 'butter',
      originalQty: 10,
      qtyG: 10,
    }),
    makeLine({
      id: 3,
      position: 3,
      ingredientId: 202,
      ingredientName: 'Sugar',
      ingredientSlug: 'sugar',
      originalText: 'sugar',
      originalQty: 50,
      qtyG: 50,
    }),
  ],
  steps: [
    step({
      id: 1,
      position: 1,
      bodyMd: 'Mash the [banana](#line-1) and whisk in the [sugar](#line-3).',
      bodyResolved: [
        { kind: 'text', value: 'Mash the ' },
        { kind: 'ref', ingredientIndex: 1, ingredientId: 200, variantId: null, prepStateId: null },
        { kind: 'text', value: ' and whisk in the ' },
        { kind: 'ref', ingredientIndex: 3, ingredientId: 202, variantId: null, prepStateId: null },
        { kind: 'text', value: '.' },
      ],
    }),
    step({
      id: 2,
      position: 2,
      bodyMd: 'Melt the [butter](#line-2), wait [2 min](#timer).',
      bodyResolved: [
        { kind: 'text', value: 'Melt the ' },
        { kind: 'ref', ingredientIndex: 2, ingredientId: 201, variantId: null, prepStateId: null },
        { kind: 'text', value: ', wait ' },
        { kind: 'time', qty: { qty: 2, unit: 'min' } },
        { kind: 'text', value: '.' },
      ],
    }),
    step({
      id: 3,
      position: 3,
      bodyMd: 'Cook at [180 c](#temperature) for [8 min](#timer).',
      bodyResolved: [
        { kind: 'text', value: 'Cook at ' },
        { kind: 'temperature', qty: { qty: 180, unit: 'c' } },
        { kind: 'text', value: ' for ' },
        { kind: 'time', qty: { qty: 8, unit: 'min' } },
        { kind: 'text', value: '.' },
      ],
    }),
  ],
  yieldIngredient: {
    id: 100,
    parentId: null,
    name: 'Pancake',
    slug: 'pancake',
    defaultUnit: 'count',
    densityGPerMl: null,
    notes: null,
    createdAt: '2026-06-01T00:00:00Z',
  },
  yieldVariant: null,
  yieldPrepState: null,
  tags: ['breakfast'],
};

const TOMATO: RecipeVersionWithCompiledData = {
  ...PANCAKES,
  recipe: { ...PANCAKES.recipe, id: 2, slug: 'parity-tomato' },
  version: {
    ...PANCAKES.version,
    id: 20,
    recipeId: 2,
    title: 'Parity tomato sauce',
    servings: 4,
    prepMinutes: null,
    cookMinutes: null,
    yieldIngredientId: 300,
    yieldVariantId: 310,
    yieldPrepStateId: 400,
    yieldQty: 500,
    yieldUnit: 'g',
  },
  lines: [
    makeLine({
      id: 10,
      position: 1,
      ingredientId: 300,
      ingredientName: 'Tomato',
      ingredientSlug: 'tomato',
      variantId: 310,
      variantName: 'Roma tomato',
      variantSlug: 'roma',
      originalText: 'tomato:roma',
      originalQty: 4,
      originalUnit: 'count',
      canonicalUnit: 'count',
      qtyG: null,
      qtyCount: 4,
    }),
  ],
  steps: [
    step({
      id: 10,
      position: 1,
      bodyMd: 'Braise the [tomato](#line-1) slowly.',
      bodyResolved: [
        { kind: 'text', value: 'Braise the ' },
        { kind: 'ref', ingredientIndex: 1, ingredientId: 300, variantId: 310, prepStateId: null },
        { kind: 'text', value: ' slowly.' },
      ],
    }),
  ],
  yieldIngredient: {
    id: 300,
    parentId: null,
    name: 'Tomato',
    slug: 'tomato',
    defaultUnit: 'count',
    densityGPerMl: null,
    notes: null,
    createdAt: '2026-06-01T00:00:00Z',
  },
  yieldVariant: {
    id: 310,
    ingredientId: 300,
    name: 'Roma tomato',
    slug: 'roma',
    defaultUnit: 'count',
    densityGPerMl: null,
    defaultShelfLifeDaysFridge: null,
    defaultShelfLifeDaysFreezer: null,
    packageSizeG: null,
    notes: null,
    createdAt: '2026-06-01T00:00:00Z',
  },
  yieldPrepState: { id: 400, name: 'Braised', slug: 'braised' },
  tags: [],
};

function makeLine(
  overrides: Partial<RecipeVersionWithCompiledData['lines'][number]>
): RecipeVersionWithCompiledData['lines'][number] {
  return {
    id: 1,
    position: 1,
    ingredientId: 200,
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
    ingredientName: 'Banana',
    ingredientSlug: 'banana',
    variantName: null,
    variantSlug: null,
    prepStateName: null,
    prepStateSlug: null,
    recipeRefSlug: null,
    recipeRefTitle: null,
    ...overrides,
  };
}

describe('Round-trip parity (compiled fixture → render)', () => {
  it('renders every recipe_lines row as an ingredient list <li>', () => {
    render(<RecipeRenderer recipeVersion={PANCAKES} />);
    expect(screen.getAllByTestId('recipe-ingredient-row')).toHaveLength(3);
  });

  it('substitutes step body anchors with rendered chips, timers, and temp badges', () => {
    render(<RecipeRenderer recipeVersion={PANCAKES} />);

    const chips = screen.getAllByTestId('ingredient-chip');
    expect(chips.length).toBeGreaterThanOrEqual(3);

    expect(screen.getAllByTestId('timer-button')).toHaveLength(2);
    expect(screen.getAllByTestId('temp-badge').length).toBeGreaterThanOrEqual(1);
  });

  it('assembles the yield label from variant + prep + qty', () => {
    render(<RecipeRenderer recipeVersion={TOMATO} />);

    const yieldLine = screen.getByTestId('recipe-yield');
    expect(yieldLine).toHaveTextContent(/tomato/i);
    expect(yieldLine).toHaveTextContent(/roma/i);
    expect(yieldLine).toHaveTextContent(/braised/i);
    expect(yieldLine).toHaveTextContent(/500/);
    expect(yieldLine).toHaveTextContent(/g/);
  });

  it('renders header columns from recipe_versions', () => {
    render(<RecipeRenderer recipeVersion={PANCAKES} />);

    expect(screen.getByRole('heading', { level: 1, name: /parity pancakes/i })).toBeInTheDocument();
    expect(screen.getByTestId('recipe-servings')).toHaveTextContent('2');
    expect(screen.getByTestId('recipe-prep')).toHaveTextContent('5');
    expect(screen.getByTestId('recipe-cook')).toHaveTextContent('10');
  });
});
