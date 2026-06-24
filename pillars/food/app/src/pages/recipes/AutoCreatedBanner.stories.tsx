import { createInstance } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';

import enAUFood from '@pops/locales/en-AU/food.json';

import { AutoCreatedBanner } from './AutoCreatedBanner';

import type { Meta, StoryObj } from '@storybook/react-vite';

function Host({ slugs }: { slugs: string[] }) {
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
          <AutoCreatedBanner slugs={slugs} />
        </div>
      </MemoryRouter>
    </I18nextProvider>
  );
}

const meta: Meta<typeof Host> = {
  title: 'Food/recipes/AutoCreatedBanner',
  component: Host,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = { args: { slugs: ['dragonfruit'] } };
export const Several: Story = {
  args: { slugs: ['dragonfruit', 'cherimoya', 'mangosteen', 'rambutan'] },
};
