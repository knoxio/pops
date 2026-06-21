/**
 * PRD-133 — Storybook coverage for the prompt viewer page.
 *
 * `apps/pops-storybook/.storybook/main.ts` discovers stories from
 * `packages/*\/src/**\/*.stories.@(ts|tsx)`, so this file lives next to
 * the page (same convention `DslEditor.stories.tsx` /
 * `RecipeRenderer.stories.tsx` adopted).
 */
import { createInstance, type i18n as I18n } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import enAUFood from '../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';
import { PromptViewerPage } from './PromptViewerPage';

import type { Meta, StoryObj } from '@storybook/react-vite';

function StoryHost() {
  const i18n = useMemo<I18n>(() => {
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
      <div className="bg-background min-h-screen">
        <PromptViewerPage />
      </div>
    </I18nextProvider>
  );
}

const meta: Meta<typeof StoryHost> = {
  title: 'Food/PromptViewerPage',
  component: StoryHost,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
