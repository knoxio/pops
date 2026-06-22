/**
 * PRD-138 — RTL coverage for the Rejected tab.
 *
 *   - renders rows from the mocked SDK query
 *   - Undo invokes `inbox.unreject` with `{ versionId }` + surfaces
 *     a success toast on `{ ok: true }`
 *   - Undo failure rolls back the optimistic removal + surfaces an error toast
 *   - filter chip toggle updates the query input
 *   - empty state renders the recovery copy
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

import type { RejectedRow } from '../inbox-types';

const inboxListRejectedMock = vi.hoisted(() => vi.fn());
const inboxUnrejectMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  inboxListRejected: inboxListRejectedMock,
  inboxUnreject: inboxUnrejectMock,
}));

import { RejectedTab } from '../RejectedTab.js';

function makeRow(over: Partial<RejectedRow> = {}): RejectedRow {
  return {
    versionId: 1,
    recipeSlug: 'banana-pancakes',
    sourceId: 7,
    title: 'Banana pancakes',
    reason: 'duplicate',
    note: null,
    rejectedAt: '2026-06-10T16:00:00Z',
    ingestKind: 'url-web',
    sourceUrl: 'https://example.com/banana-pancakes',
    ingestCostUsd: null,
    ...over,
  };
}

function mockList(items: RejectedRow[], nextCursor: string | null = null): void {
  inboxListRejectedMock.mockResolvedValue({ data: { items, nextCursor } });
}

function lastListBody(): Record<string, unknown> {
  const call = inboxListRejectedMock.mock.calls.at(-1);
  if (call === undefined) throw new Error('inboxListRejected was not called');
  return (call[0] as { body: Record<string, unknown> }).body;
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
});

describe('RejectedTab — PRD-138', () => {
  it('renders rows from listRejected', async () => {
    mockList([makeRow(), makeRow({ versionId: 2, title: 'Lentil dahl' })]);
    render(
      <Wrapper>
        <RejectedTab now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByText('Banana pancakes')).toBeInTheDocument();
    expect(screen.getByText('Lentil dahl')).toBeInTheDocument();
  });

  it('shows the empty-state copy when listRejected returns []', async () => {
    mockList([]);
    render(
      <Wrapper>
        <RejectedTab now={FIXED_NOW} />
      </Wrapper>
    );
    expect(await screen.findByText(/No rejected drafts/i)).toBeInTheDocument();
  });

  it('invokes Undo and surfaces a success toast on { ok: true }', async () => {
    mockList([makeRow()]);
    inboxUnrejectMock.mockResolvedValue({ data: { ok: true, restoredAs: 'draft' } });
    render(
      <Wrapper>
        <RejectedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Undo rejection/i }));
    expect(inboxUnrejectMock).toHaveBeenCalledWith({ body: { versionId: 1 } });
    await waitFor(() => {
      expect(screen.getByText('Restored to Drafts.')).toBeInTheDocument();
    });
  });

  it('rolls back the optimistic removal + surfaces an error toast on failure', async () => {
    mockList([makeRow()]);
    let rejectUnreject: (e: unknown) => void = () => {};
    inboxUnrejectMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectUnreject = reject;
      })
    );
    render(
      <Wrapper>
        <RejectedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    expect(await screen.findByText('Banana pancakes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Undo rejection/i }));
    // Optimistic: the row vanishes before the mutation resolves.
    await waitFor(() => {
      expect(screen.queryByText('Banana pancakes')).not.toBeInTheDocument();
    });
    rejectUnreject(new Error('boom'));
    // Rollback: the row reappears + the error toast surfaces.
    expect(await screen.findByText('Banana pancakes')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Couldn’t undo: boom/i)).toBeInTheDocument();
    });
  });

  it('passes filter chip toggles into the query input', async () => {
    mockList([]);
    render(
      <Wrapper>
        <RejectedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => {
      const reasons = lastListBody().reasons;
      expect(Array.isArray(reasons) && reasons.includes('duplicate')).toBe(true);
    });
  });
});
