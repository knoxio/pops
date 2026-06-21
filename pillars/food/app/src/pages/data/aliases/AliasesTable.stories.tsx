/**
 * Storybook coverage for the pure sub-components of the Aliases tab
 * (PRD-122-C).
 *
 * The full `AliasesTabContent` consumes tRPC hooks that aren't trivial
 * to mock at the Storybook level; the table and toolbar both take all
 * their data via props, so they get stories directly. `apps/pops-storybook/`
 * picks these up via the `packages/*\/src/**\/*.stories.*` glob the
 * RecipeRenderer story file documents.
 */
import { createInstance, type i18n } from 'i18next';
import { useMemo, useState } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';
import { AliasesTable } from './AliasesTable';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { AliasRow, AliasSortKey, SortState } from './types';

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

const SAMPLE_ROWS: AliasRow[] = [
  {
    id: 1,
    alias: 'platano',
    source: 'user',
    createdAt: '2026-06-01',
    target: { kind: 'ingredient', id: 10, slug: 'banana', name: 'Banana' },
  },
  {
    id: 2,
    alias: 'bnana',
    source: 'llm',
    createdAt: '2026-06-02',
    target: { kind: 'ingredient', id: 10, slug: 'banana', name: 'Banana' },
  },
  {
    id: 3,
    alias: 'maduro',
    source: 'user',
    createdAt: '2026-06-03',
    target: {
      kind: 'variant',
      id: 99,
      slug: 'ripe',
      name: 'Ripe',
      parentIngredientSlug: 'banana',
      parentIngredientName: 'Banana',
    },
  },
];

function Harness({
  initialRows,
  initialSelected = new Set<number>(),
}: {
  initialRows: AliasRow[];
  initialSelected?: ReadonlySet<number>;
}) {
  const [sort, setSort] = useState<SortState>({ key: 'alias', direction: 'asc' });
  const [selected, setSelected] = useState<ReadonlySet<number>>(initialSelected);
  return (
    <AliasesTable
      rows={initialRows}
      sort={sort}
      onSortChange={(key: AliasSortKey) =>
        setSort((prev) => ({
          key,
          direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }))
      }
      selectedIds={selected}
      onToggleSelection={(id) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      onSelectAll={() => setSelected(new Set(initialRows.map((r) => r.id)))}
      onClearSelection={() => setSelected(new Set())}
      onUpdateAlias={() => undefined}
      onDeleteAlias={() => undefined}
    />
  );
}

const meta: Meta<typeof Harness> = {
  component: Harness,
  title: 'Food/Data/AliasesTable',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => {
      const i18n = useFoodI18n();
      return (
        <I18nextProvider i18n={i18n}>
          <div className="max-w-4xl">
            <Story />
          </div>
        </I18nextProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof Harness>;

export const Populated: Story = { args: { initialRows: SAMPLE_ROWS } };

export const Empty: Story = { args: { initialRows: [] } };

export const WithSelection: Story = {
  args: { initialRows: SAMPLE_ROWS, initialSelected: new Set([1, 2]) },
};
