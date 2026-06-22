/**
 * PRD-138 — RTL coverage for the Failed tab.
 *
 *   - renders rows from listFailed
 *   - filter chips auto-populated from failedErrorCodes
 *   - Retry → ingest.retry({ sourceId }) + optimistic remove + success toast
 *   - Retry failure → optimistic removal rolled back + error toast
 *   - View source opens ViewSourceDialog (per-kind body rendered)
 *   - empty state copy
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { Toaster } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

import type { FailedRow } from '../inbox-types';

const inboxListFailedMock = vi.hoisted(() => vi.fn());
const inboxFailedErrorCodesMock = vi.hoisted(() => vi.fn());
const ingestRetryMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  inboxListFailed: inboxListFailedMock,
  inboxFailedErrorCodes: inboxFailedErrorCodesMock,
  ingestRetry: ingestRetryMock,
}));

import { FailedTab } from '../FailedTab.js';

function makeRow(over: Partial<FailedRow> = {}): FailedRow {
  return {
    sourceId: 100,
    ingestKind: 'url-instagram',
    sourceUrl: 'https://instagram.com/p/abc',
    errorCode: 'InstagramRateLimited',
    errorMessage: '429 Too Many Requests.',
    ingestedAt: '2026-06-10T15:30:00Z',
    attempts: 2,
    ...over,
  };
}

function mockList(items: FailedRow[], nextCursor: string | null = null): void {
  inboxListFailedMock.mockResolvedValue({ data: { items, nextCursor } });
}

function mockCodes(items: string[]): void {
  inboxFailedErrorCodesMock.mockResolvedValue({ data: { items } });
}

function Wrapper({ children }: { children: ReactElement }): ReactElement {
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
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
    []
  );
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          {children}
          <Toaster />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

const FIXED_NOW = new Date('2026-06-10T18:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  mockList([]);
  mockCodes([]);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('FailedTab — PRD-138', () => {
  it('renders rows from listFailed', async () => {
    mockList([makeRow(), makeRow({ sourceId: 101, errorCode: 'Timeout' })]);
    mockCodes(['InstagramRateLimited', 'Timeout']);
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getAllByText('InstagramRateLimited').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('Timeout').length).toBeGreaterThanOrEqual(1);
  });

  it('auto-populates the error-code filter from failedErrorCodes', async () => {
    mockList([]);
    mockCodes(['AllExtractionPathsFailed', 'Timeout']);
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    expect(
      await screen.findByRole('button', { name: 'AllExtractionPathsFailed' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeout' })).toBeInTheDocument();
  });

  it('invokes Retry + surfaces success toast', async () => {
    mockList([makeRow()]);
    mockCodes(['InstagramRateLimited']);
    ingestRetryMock.mockResolvedValue({ data: { jobId: 'j1', queuedAt: '2026-06-10T16:00:00Z' } });
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Retry ingest/i }));
    expect(ingestRetryMock).toHaveBeenCalledWith({ body: { sourceId: 100 } });
    await waitFor(() => {
      expect(screen.getByText('Re-queued.')).toBeInTheDocument();
    });
  });

  it('rolls back optimistic removal + surfaces error toast on Retry failure', async () => {
    mockList([makeRow()]);
    mockCodes(['InstagramRateLimited']);
    let rejectRetry: (e: unknown) => void = () => {};
    ingestRetryMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRetry = reject;
      })
    );
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Retry ingest/i }));
    // Optimistic: the row leaves the cached page before the mutation resolves.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Retry ingest/i })).not.toBeInTheDocument();
    });
    rejectRetry(new Error('queue down'));
    // Rollback: the row comes back + the error toast surfaces.
    expect(await screen.findByRole('button', { name: /Retry ingest/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Couldn’t re-queue: queue down/i)).toBeInTheDocument();
    });
  });

  it('renders the empty state when listFailed returns []', async () => {
    mockList([]);
    mockCodes([]);
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByText(/No failed ingests/i)).toBeInTheDocument();
  });

  it('opens View source dialog with per-kind body', async () => {
    mockList([makeRow({ ingestKind: 'screenshot', sourceUrl: null })]);
    mockCodes(['InstagramRateLimited']);
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /View source for/i }));
    expect(await screen.findByRole('img', { name: 'Ingested screenshot' })).toBeInTheDocument();
  });
});
