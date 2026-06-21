/**
 * Storybook for the Rejected tab row.
 *
 * Pins a fixed `now` Date so the relative-time string is deterministic in
 * the rendered story.
 */
import { createInstance } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';
import { type RejectedRow } from './inbox-types';
import { RejectedRowCard } from './RejectedRow';

import type { Meta, StoryObj } from '@storybook/react-vite';

const FIXED_NOW = new Date('2026-06-10T18:00:00Z');

const BASE_ROW: RejectedRow = {
  versionId: 42,
  recipeSlug: 'banana-pancakes',
  sourceId: 7,
  title: 'Banana pancakes (v1 reject)',
  reason: 'duplicate',
  note: null,
  rejectedAt: '2026-06-10T16:00:00Z',
  ingestKind: 'url-web',
  sourceUrl: 'https://example.com/recipes/banana-pancakes-the-very-best-of-all-time',
  ingestCostUsd: 0.0123,
};

function Host({ row, isUndoing = false }: { row: RejectedRow; isUndoing?: boolean }) {
  const i18n = useMemo(() => {
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
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <div className="bg-background max-w-3xl p-6">
          <RejectedRowCard
            row={row}
            onUndo={() => {}}
            isUndoing={isUndoing}
            now={FIXED_NOW}
            t={i18n.getFixedT('en-AU', 'food')}
          />
        </div>
      </MemoryRouter>
    </I18nextProvider>
  );
}

const meta: Meta<typeof Host> = {
  title: 'Food/inbox/RejectedRow',
  component: Host,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const UrlWebDuplicate: Story = { args: { row: BASE_ROW } };

export const InstagramWrongRecipe: Story = {
  args: {
    row: {
      ...BASE_ROW,
      ingestKind: 'url-instagram',
      sourceUrl: 'https://instagram.com/p/CxYz12345',
      reason: 'wrong-recipe',
      title: 'Spicy noodle reel (v2 reject)',
      rejectedAt: '2026-06-09T10:00:00Z',
      ingestCostUsd: null,
    },
  },
};

export const TextNoTitle: Story = {
  args: {
    row: {
      ...BASE_ROW,
      ingestKind: 'text',
      sourceUrl: null,
      title: null,
      reason: 'low-quality-extraction',
      rejectedAt: '2026-06-10T17:30:00Z',
    },
  },
};

export const Undoing: Story = { args: { row: BASE_ROW, isUndoing: true } };
