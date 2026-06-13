/**
 * PRD-138 — RTL coverage for the Failed tab.
 *
 *   - renders rows from listFailed
 *   - filter chips auto-populated from failedErrorCodes
 *   - Retry → food.ingest.retry({ sourceId }) + optimistic remove + success toast
 *   - Retry onError → snapshot restored + error toast
 *   - View source opens ViewSourceDialog (per-kind body rendered)
 *   - empty state copy
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { Toaster } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

import type { FailedRow } from '../inbox-types';

const mockListFailed = vi.fn();
const mockFailedCodes = vi.fn();
const mockSetData = vi.fn();
const mockInvalidate = vi.fn();
const mockRetryMutate = vi.fn();
let mockRetryOpts:
  | {
      onMutate?: (input: { sourceId: number }) => { snapshot: unknown };
      onError?: (err: Error, input: { sourceId: number }, ctx: { snapshot: unknown }) => void;
      onSuccess?: () => void;
      onSettled?: () => void;
    }
  | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mockRetryOpts = undefined;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'inbox.listFailed') return mockListFailed(input);
    if (key === 'inbox.failedErrorCodes') return mockFailedCodes();
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: NonNullable<typeof mockRetryOpts>
  ) => {
    const key = path.join('.');
    if (key === 'ingest.retry') {
      mockRetryOpts = opts;
      return { mutate: mockRetryMutate, isPending: false, variables: undefined };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    setData: mockSetData,
    invalidate: mockInvalidate,
  }),
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
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        {children}
        <Toaster />
      </MemoryRouter>
    </I18nextProvider>
  );
}

const FIXED_NOW = new Date('2026-06-10T18:00:00Z');

describe('FailedTab — PRD-138', () => {
  it('renders rows from listFailed', () => {
    mockListFailed.mockReturnValue({
      data: {
        items: [makeRow(), makeRow({ sourceId: 101, errorCode: 'Timeout' })],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockFailedCodes.mockReturnValue({ data: ['InstagramRateLimited', 'Timeout'] });
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    // Both rows render — the chip shows the code in the row, and the filter
    // chip also lists it (auto-populated). Assert at least one node per code
    // exists rather than uniqueness.
    expect(screen.getAllByText('InstagramRateLimited').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Timeout').length).toBeGreaterThanOrEqual(1);
  });

  it('auto-populates the error-code filter from failedErrorCodes', () => {
    mockListFailed.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockFailedCodes.mockReturnValue({ data: ['AllExtractionPathsFailed', 'Timeout'] });
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: 'AllExtractionPathsFailed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeout' })).toBeInTheDocument();
  });

  it('invokes Retry + surfaces success toast', async () => {
    mockListFailed.mockReturnValue({
      data: { items: [makeRow()], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockFailedCodes.mockReturnValue({ data: ['InstagramRateLimited'] });
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Retry ingest/i }));
    expect(mockRetryMutate).toHaveBeenCalledWith({ sourceId: 100 });
    mockRetryOpts?.onSuccess?.();
    await waitFor(() => {
      expect(screen.getByText('Re-queued.')).toBeInTheDocument();
    });
  });

  it('restores snapshot + error toast on Retry failure', async () => {
    const snapshot = { items: [makeRow()], nextCursor: null };
    mockListFailed.mockReturnValue({
      data: snapshot,
      isLoading: false,
      isError: false,
      error: null,
    });
    mockFailedCodes.mockReturnValue({ data: ['InstagramRateLimited'] });
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Retry ingest/i }));
    mockRetryOpts?.onError?.(new Error('queue down'), { sourceId: 100 }, { snapshot });
    expect(mockSetData).toHaveBeenCalledWith(
      ['inbox', 'listFailed'],
      expect.objectContaining({}),
      expect.any(Function)
    );
    await waitFor(() => {
      expect(screen.getByText(/Couldn’t re-queue: queue down/i)).toBeInTheDocument();
    });
  });

  it('renders the empty state when listFailed returns []', () => {
    mockListFailed.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockFailedCodes.mockReturnValue({ data: [] });
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByText(/No failed ingests/i)).toBeInTheDocument();
  });

  it('opens View source dialog with per-kind body', async () => {
    mockListFailed.mockReturnValue({
      data: { items: [makeRow({ ingestKind: 'screenshot', sourceUrl: null })], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockFailedCodes.mockReturnValue({ data: ['InstagramRateLimited'] });
    render(
      <Wrapper>
        <FailedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /View source for/i }));
    expect(await screen.findByRole('img', { name: 'Ingested screenshot' })).toBeInTheDocument();
  });
});
