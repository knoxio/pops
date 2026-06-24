/**
 * Storybook stories for the lists-index row card. Pure-presentation, so the
 * stories drive the variants directly.
 *
 * Wraps in a self-contained `I18nextProvider` because `ListRow` mounts
 * `ListKindChip`, which calls `useTranslation('lists')` for the kind label.
 * Without the wrapper the chip would render the raw key from an
 * uninitialised global i18n instance (the storybook preview has no i18n
 * decorator).
 */
import { createInstance } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';

import enAULists from '@pops/locales/en-AU/lists.json';

import { ListRow } from './ListRow';

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

import type { ListIndexItemView } from './useListsIndexQuery';

const baseItem: ListIndexItemView = {
  id: 1,
  name: 'Weekly groceries',
  kind: 'shopping',
  ownerApp: 'user',
  itemCount: 12,
  uncheckedCount: 5,
  lastUpdatedAt: '2026-06-09T15:30:00Z',
  archivedAt: null,
};

function Host({ item }: { item: ListIndexItemView }): ReactElement {
  const i18n = useMemo(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      lng: 'en-AU',
      fallbackLng: 'en-AU',
      ns: ['lists'],
      defaultNS: 'lists',
      interpolation: { escapeValue: false },
      resources: { 'en-AU': { lists: enAULists } },
    });
    return instance;
  }, []);
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <div className="bg-background max-w-2xl p-4">
          <ListRow item={item} t={(key, opts) => formatKey(key, opts)} />
        </div>
      </MemoryRouter>
    </I18nextProvider>
  );
}

const meta: Meta<typeof Host> = {
  title: 'Lists/ListRow',
  component: Host,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Shopping: Story = { args: { item: baseItem } };
export const ShoppingFullyChecked: Story = {
  args: { item: { ...baseItem, uncheckedCount: 0 } },
};
export const Empty: Story = {
  args: { item: { ...baseItem, itemCount: 0, uncheckedCount: 0, name: 'New list' } },
};
export const Packing: Story = {
  args: { item: { ...baseItem, kind: 'packing', name: 'Camping trip' } },
};
export const Todo: Story = {
  args: { item: { ...baseItem, kind: 'todo', name: 'House chores' } },
};
export const Generic: Story = {
  args: { item: { ...baseItem, kind: 'generic', name: 'Random list' } },
};
export const Archived: Story = {
  args: { item: { ...baseItem, archivedAt: '2026-05-30T00:00:00Z' } },
};
export const ManyItems: Story = {
  args: { item: { ...baseItem, itemCount: 240, uncheckedCount: 199 } },
};

function formatKey(key: string, opts?: Record<string, unknown>): string {
  if (opts?.count !== undefined) return `${key}=${String(opts.count)}`;
  if (opts?.when !== undefined) return `${key}=${String(opts.when)}`;
  return key;
}
