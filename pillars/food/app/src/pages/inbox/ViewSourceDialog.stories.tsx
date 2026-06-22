/**
 * Storybook for the per-kind View-source dialog.
 *
 * Each story passes a `FailedRow` shaped for one ingest kind so the body
 * renders the URL+iframe, screenshot image, or text placeholder.
 */
import { createInstance } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import enAUFood from '@pops/locales/en-AU/food.json';

import { type FailedRow } from './inbox-types';
import { ViewSourceDialog } from './ViewSourceDialog';

import type { Meta, StoryObj } from '@storybook/react-vite';

const BASE_ROW: FailedRow = {
  sourceId: 11,
  ingestKind: 'url-web',
  sourceUrl: 'https://example.com/recipe',
  errorCode: 'Timeout',
  errorMessage: 'Fetch timed out.',
  ingestedAt: '2026-06-10T12:00:00Z',
  attempts: 1,
};

function Host({ row }: { row: FailedRow }) {
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
      <ViewSourceDialog row={row} onClose={() => {}} t={i18n.getFixedT('en-AU', 'food')} />
    </I18nextProvider>
  );
}

const meta: Meta<typeof Host> = {
  title: 'Food/inbox/ViewSourceDialog',
  component: Host,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const UrlWeb: Story = { args: { row: BASE_ROW } };

export const Instagram: Story = {
  args: {
    row: {
      ...BASE_ROW,
      ingestKind: 'url-instagram',
      sourceUrl: 'https://instagram.com/p/CxYz12345',
    },
  },
};

export const Screenshot: Story = {
  args: {
    row: {
      ...BASE_ROW,
      ingestKind: 'screenshot',
      sourceUrl: null,
    },
  },
};

export const Text: Story = {
  args: {
    row: {
      ...BASE_ROW,
      ingestKind: 'text',
      sourceUrl: null,
    },
  },
};
