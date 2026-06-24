/**
 * Storybook stories for the Prep states tab's `AddPrepStateDialog`
 * (pillars/food/docs/prds/data-page).
 *
 * The dialog is a pure-presentation component (slug + name inputs +
 * submit/cancel) that takes all data via props, so no network mocking is
 * needed. Stories cover the open + submitting states; the full tab
 * (`PrepStatesTabContent`) calls the prep-states REST endpoints and is
 * exercised in the RTL suite, not Storybook.
 */
import { createInstance, type i18n } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import enAUFood from '@pops/locales/en-AU/food.json';

import { AddPrepStateDialog } from './AddPrepStateDialog.js';

import type { Meta, StoryObj } from '@storybook/react-vite';

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

const meta: Meta<typeof AddPrepStateDialog> = {
  component: AddPrepStateDialog,
  title: 'Food/Data/AddPrepStateDialog',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => {
      const i18n = useFoodI18n();
      return (
        <I18nextProvider i18n={i18n}>
          <Story />
        </I18nextProvider>
      );
    },
  ],
  args: {
    open: true,
    onOpenChange: () => undefined,
    onSubmit: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof AddPrepStateDialog>;

export const Open: Story = {};

export const Submitting: Story = { args: { isSubmitting: true } };
