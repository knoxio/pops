import { createInstance, type i18n } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';
import { SubstitutionsTable } from './SubstitutionsTable';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { HydratedSubstitutionView } from './substitution-wire-types.js';

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

const meta: Meta<typeof SubstitutionsTable> = {
  component: SubstitutionsTable,
  title: 'Food/SubstitutionsTable',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => {
      const i18n = useFoodI18n();
      return (
        <I18nextProvider i18n={i18n}>
          <div className="max-w-5xl">
            <Story />
          </div>
        </I18nextProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof SubstitutionsTable>;

const SAMPLE_ROWS: HydratedSubstitutionView[] = [
  {
    id: 1,
    fromIngredientId: 100,
    fromVariantId: null,
    toIngredientId: 200,
    toVariantId: null,
    ratio: 1.25,
    contextTags: ['baking'],
    scope: 'global',
    recipeId: null,
    notes: null,
    createdAt: '2026-06-09',
    from: {
      kind: 'ingredient',
      id: 100,
      slug: 'butter',
      name: 'Butter',
      parentSlug: null,
    },
    to: {
      kind: 'ingredient',
      id: 200,
      slug: 'olive-oil',
      name: 'Olive oil',
      parentSlug: null,
    },
    recipeSlug: null,
  },
  {
    id: 2,
    fromIngredientId: null,
    fromVariantId: 300,
    toIngredientId: null,
    toVariantId: 400,
    ratio: 1,
    contextTags: [],
    scope: 'recipe',
    recipeId: 42,
    notes: 'Sub for weeknight pasta',
    createdAt: '2026-06-09',
    from: {
      kind: 'variant',
      id: 300,
      slug: 'whole',
      name: 'Whole milk',
      parentSlug: 'milk',
    },
    to: {
      kind: 'variant',
      id: 400,
      slug: 'skim',
      name: 'Skim milk',
      parentSlug: 'milk',
    },
    recipeSlug: 'weeknight-pasta',
  },
];

const noop = () => undefined;

export const Empty: Story = {
  args: {
    rows: [],
    isLoading: false,
    isUpdating: false,
    isDeleting: false,
    rowError: null,
    onUpdate: noop,
    onDelete: noop,
  },
};

export const Loading: Story = {
  args: {
    rows: [],
    isLoading: true,
    isUpdating: false,
    isDeleting: false,
    rowError: null,
    onUpdate: noop,
    onDelete: noop,
  },
};

export const WithRows: Story = {
  args: {
    rows: SAMPLE_ROWS,
    isLoading: false,
    isUpdating: false,
    isDeleting: false,
    rowError: null,
    onUpdate: noop,
    onDelete: noop,
  },
};

export const WithRowError: Story = {
  args: {
    rows: SAMPLE_ROWS,
    isLoading: false,
    isUpdating: false,
    isDeleting: false,
    rowError: 'Substitution already exists.',
    onUpdate: noop,
    onDelete: noop,
  },
};
