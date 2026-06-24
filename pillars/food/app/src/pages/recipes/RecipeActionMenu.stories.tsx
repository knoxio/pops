import { createInstance } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';

import enAUFood from '@pops/locales/en-AU/food.json';

import { RecipeActionMenu, type RecipeActionMenuItem } from './RecipeActionMenu';

import type { Meta, StoryObj } from '@storybook/react-vite';

interface HostProps {
  slug: string;
  draftCount: number;
  withExtras: boolean;
}

function Host({ slug, draftCount, withExtras }: HostProps) {
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
  const extras: RecipeActionMenuItem[] = withExtras
    ? [
        { label: 'Cook now…', value: 'cook', onSelect: () => {} },
        { label: 'Send to shopping list…', value: 'send', onSelect: () => {} },
      ]
    : [];
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <div className="bg-background flex min-h-screen items-start justify-end p-6">
          <RecipeActionMenu
            slug={slug}
            draftCount={draftCount}
            onArchive={() => {}}
            extraItems={extras}
          />
        </div>
      </MemoryRouter>
    </I18nextProvider>
  );
}

const meta: Meta<typeof Host> = {
  title: 'Food/recipes/RecipeActionMenu',
  component: Host,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { slug: 'banana-pancakes', draftCount: 2, withExtras: false },
};
export const WithExtraItems: Story = {
  args: { slug: 'banana-pancakes', draftCount: 2, withExtras: true },
};
