/**
 * Storybook for the no-published-version banner shown on
 * `RecipeDetailPage` when `current_version_id IS NULL`.
 */
import { createInstance } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';
import { MissingCurrentVersionBanner } from './MissingCurrentVersionBanner';

import type { Meta, StoryObj } from '@storybook/react-vite';

function Host({ slug }: { slug: string }) {
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
        <div className="bg-background max-w-2xl p-6">
          <MissingCurrentVersionBanner slug={slug} />
        </div>
      </MemoryRouter>
    </I18nextProvider>
  );
}

const meta: Meta<typeof Host> = {
  title: 'Food/recipes/MissingCurrentVersionBanner',
  component: Host,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { slug: 'banana-pancakes' } };
