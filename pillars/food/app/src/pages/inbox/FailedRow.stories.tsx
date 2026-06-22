/**
 * Storybook for the Failed-ingests tab row.
 */
import { createInstance } from 'i18next';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';

import enAUFood from '@pops/locales/en-AU/food.json';

import { FailedRowCard } from './FailedRow';
import { type FailedRow } from './inbox-types';

import type { Meta, StoryObj } from '@storybook/react-vite';

const FIXED_NOW = new Date('2026-06-10T18:00:00Z');

const BASE_ROW: FailedRow = {
  sourceId: 103,
  ingestKind: 'url-instagram',
  sourceUrl: 'https://instagram.com/p/CxYz12345',
  errorCode: 'InstagramRateLimited',
  errorMessage: '429 Too Many Requests. Retry after 600 seconds.',
  ingestedAt: '2026-06-10T15:30:00Z',
  attempts: 3,
};

function Host({ row, isRetrying = false }: { row: FailedRow; isRetrying?: boolean }) {
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
          <FailedRowCard
            row={row}
            onRetry={() => {}}
            onViewSource={() => {}}
            isRetrying={isRetrying}
            now={FIXED_NOW}
            t={i18n.getFixedT('en-AU', 'food')}
          />
        </div>
      </MemoryRouter>
    </I18nextProvider>
  );
}

const meta: Meta<typeof Host> = {
  title: 'Food/inbox/FailedRow',
  component: Host,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const InstagramRateLimited: Story = { args: { row: BASE_ROW } };

export const WebTimeout: Story = {
  args: {
    row: {
      ...BASE_ROW,
      ingestKind: 'url-web',
      sourceUrl: 'https://example.com/long-recipe-page',
      errorCode: 'Timeout',
      errorMessage:
        'Fetch timed out after 15s. The page may be heavily rate-limited or the server may be unresponsive.',
      attempts: 1,
    },
  },
};

export const ScreenshotEmptyExtraction: Story = {
  args: {
    row: {
      ...BASE_ROW,
      ingestKind: 'screenshot',
      sourceUrl: null,
      errorCode: 'AllExtractionPathsFailed',
      errorMessage: 'Vision pass returned empty; text fallback also empty.',
      attempts: 2,
    },
  },
};

export const Retrying: Story = { args: { row: BASE_ROW, isRetrying: true } };
