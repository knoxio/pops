import { createInstance, type i18n } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import enAUFood from '@pops/locales/en-AU/food.json';

import { RecipeRenderer } from './RecipeRenderer';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { ResolvedStepBody, RecipeVersionWithCompiledData } from './recipe-render-types.js';

/**
 * RecipeRenderer stories — `libs/ui/.storybook/main.ts` discovers stories
 * from `pillars/*\/*\/src/**\/*.stories.@(...)`, so this file lives next
 * to the component.
 */

function useFoodI18n(): i18n {
  return useMemo(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      lng: 'en-AU',
      fallbackLng: 'en-AU',
      ns: ['food'],
      defaultNS: 'food',
      interpolation: { escapeValue: false },
      resources: { 'en-AU': { food: enAUFood } },
    });
    return instance;
  }, []);
}

const meta: Meta<typeof RecipeRenderer> = {
  component: RecipeRenderer,
  title: 'Food/RecipeRenderer',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => {
      const i18n = useFoodI18n();
      return (
        <I18nextProvider i18n={i18n}>
          <div className="max-w-3xl">
            <Story />
          </div>
        </I18nextProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof RecipeRenderer>;

const FIXTURE_PANCAKE_YIELD = {
  id: 100,
  parentId: null,
  name: 'Pancake',
  slug: 'pancake',
  defaultUnit: 'count' as const,
  densityGPerMl: null,
  notes: null,
  createdAt: '2026-06-01T00:00:00Z',
};

const BASE_VERSION = {
  id: 10,
  recipeId: 1,
  versionNo: 1,
  status: 'current' as const,
  title: 'Banana pancakes',
  summary: 'A weekday-friendly stack of pancakes that uses up over-ripe bananas.',
  bodyDsl: '(unused by renderer)',
  yieldIngredientId: 100,
  yieldVariantId: null,
  yieldPrepStateId: null,
  yieldQty: 4 as number | null,
  yieldUnit: 'count' as string | null,
  servings: 2 as number | null,
  prepMinutes: 10 as number | null,
  cookMinutes: 15 as number | null,
  sourceId: null,
  compileStatus: 'compiled' as 'compiled' | 'uncompiled' | 'failed',
  compileError: null,
  compiledAt: '2026-06-02T12:00:00Z',
  createdAt: '2026-06-01T00:00:00Z',
};

const BASE_RECIPE = {
  id: 1,
  slug: 'banana-pancakes',
  recipeType: 'plate' as const,
  currentVersionId: 10,
  heroImagePath: null as string | null,
  archivedAt: null as string | null,
  createdAt: '2026-06-01T00:00:00Z',
};

function makeStepBody(parts: ResolvedStepBody): string {
  return JSON.stringify(parts);
}

const SIMPLE_DATA: RecipeVersionWithCompiledData = {
  recipe: { ...BASE_RECIPE },
  version: { ...BASE_VERSION },
  lines: [
    {
      id: 1,
      position: 1,
      ingredientId: 200,
      variantId: null,
      prepStateId: null,
      isRecipeRef: false,
      recipeRefId: null,
      originalText: '2 ripe bananas',
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
    },
    {
      id: 2,
      position: 2,
      ingredientId: 201,
      variantId: null,
      prepStateId: null,
      isRecipeRef: false,
      recipeRefId: null,
      originalText: '10g butter (optional)',
      originalQty: 10,
      originalUnit: 'g',
      qtyG: 10,
      qtyMl: null,
      qtyCount: null,
      canonicalUnit: 'g',
      optional: true,
      notes: null,
      ingredientName: 'Butter',
      ingredientSlug: 'butter',
      variantName: null,
      variantSlug: null,
      prepStateName: null,
      prepStateSlug: null,
      recipeRefSlug: null,
      recipeRefTitle: null,
    },
  ],
  steps: [
    {
      id: 1,
      recipeVersionId: 10,
      position: 1,
      bodyMd: 'Mash the [banana](#line-1) in a bowl.',
      bodyResolvedJson: makeStepBody([
        { kind: 'text', value: 'Mash the ' },
        {
          kind: 'ref',
          ingredientIndex: 1,
          ingredientId: 200,
          variantId: null,
          prepStateId: null,
        },
        { kind: 'text', value: ' in a bowl.' },
      ]),
      durationMinutes: null,
      temperatureValue: null,
      temperatureUnit: null,
    },
    {
      id: 2,
      recipeVersionId: 10,
      position: 2,
      bodyMd: 'Melt the [butter](#line-2) in a pan, [2 min](#timer).',
      bodyResolvedJson: makeStepBody([
        { kind: 'text', value: 'Melt the ' },
        {
          kind: 'ref',
          ingredientIndex: 2,
          ingredientId: 201,
          variantId: null,
          prepStateId: null,
        },
        { kind: 'text', value: ' in a pan, ' },
        { kind: 'time', qty: { qty: 2, unit: 'min' } },
        { kind: 'text', value: '.' },
      ]),
      durationMinutes: null,
      temperatureValue: null,
      temperatureUnit: null,
    },
    {
      id: 3,
      recipeVersionId: 10,
      position: 3,
      bodyMd: 'Add the [banana](#line-1), cook at [180°c](#temperature) for [20 min](#timer).',
      bodyResolvedJson: makeStepBody([
        { kind: 'text', value: 'Add the ' },
        {
          kind: 'ref',
          ingredientIndex: 1,
          ingredientId: 200,
          variantId: null,
          prepStateId: null,
        },
        { kind: 'text', value: ', cook at ' },
        { kind: 'temperature', qty: { qty: 180, unit: 'c' } },
        { kind: 'text', value: ' for ' },
        { kind: 'time', qty: { qty: 20, unit: 'min' } },
        { kind: 'text', value: '.' },
      ]),
      durationMinutes: 20,
      temperatureValue: 180,
      temperatureUnit: 'c',
    },
  ],
  yieldIngredient: FIXTURE_PANCAKE_YIELD,
  yieldVariant: null,
  yieldPrepState: null,
  tags: ['breakfast', 'quick'],
};

export const DetailFull: Story = {
  args: { recipeVersion: SIMPLE_DATA, variant: 'detail' },
};

export const DetailWithRefs: Story = {
  args: { recipeVersion: SIMPLE_DATA, variant: 'detail' },
  name: 'Detail with refs',
};

export const DetailWithTimers: Story = {
  args: {
    recipeVersion: SIMPLE_DATA,
    variant: 'detail',
    onTimerStart: (minutes, position) =>
      console.warn(`[Storybook] Start ${minutes}min timer for step ${position}`),
  },
  name: 'Detail with timers (clickable)',
};

export const DetailArchived: Story = {
  args: {
    recipeVersion: {
      ...SIMPLE_DATA,
      recipe: { ...SIMPLE_DATA.recipe, archivedAt: '2026-06-05T00:00:00Z' },
    },
    variant: 'detail',
  },
  name: 'Detail (archived)',
};

export const Compact: Story = {
  args: { recipeVersion: SIMPLE_DATA, variant: 'compact' },
};

export const UncompiledPlaceholder: Story = {
  args: {
    recipeVersion: {
      ...SIMPLE_DATA,
      version: { ...SIMPLE_DATA.version, compileStatus: 'failed' },
    },
  },
  name: 'Failed compile placeholder',
};
