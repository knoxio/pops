/**
 * Storybook for the type-to-confirm archive dialog. Locale set inline so
 * the story is self-contained.
 */
import { createInstance } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import enAUFood from '@pops/locales/en-AU/food.json';

import { RecipeArchiveDialog } from './RecipeArchiveDialog';

import type { Meta, StoryObj } from '@storybook/react-vite';

function Host(props: { open: boolean; title: string; isPending: boolean }) {
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
      <div className="bg-background min-h-screen p-6">
        <RecipeArchiveDialog
          open={props.open}
          title={props.title}
          isPending={props.isPending}
          onCancel={() => {}}
          onConfirm={() => {}}
        />
      </div>
    </I18nextProvider>
  );
}

const meta: Meta<typeof Host> = {
  title: 'Food/recipes/RecipeArchiveDialog',
  component: Host,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { open: true, title: 'Banana pancakes', isPending: false } };
export const Pending: Story = {
  args: { open: true, title: 'Banana pancakes', isPending: true },
};
