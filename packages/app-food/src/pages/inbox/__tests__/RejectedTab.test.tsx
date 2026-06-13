/**
 * PRD-138 — RTL coverage for the Rejected tab.
 *
 *   - renders rows from the mocked tRPC query
 *   - Undo invokes `food.inbox.unreject` with `{ versionId }` + surfaces
 *     a success toast on `{ ok: true }`
 *   - Undo failure restores the snapshot + surfaces an error toast
 *   - filter chip toggle updates the query input
 *   - empty state renders the recovery copy
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

import type { RejectedRow } from '../inbox-types';

const mockListRejected = vi.fn();
const mockSetData = vi.fn();
const mockInvalidate = vi.fn();
const mockUnrejectMutate = vi.fn();
let mockUnrejectOpts:
  | {
      onMutate?: (input: { versionId: number }) => { snapshot: unknown };
      onError?: (err: Error, input: { versionId: number }, ctx: { snapshot: unknown }) => void;
      onSuccess?: (res: { ok: boolean; reason?: string }) => void;
      onSettled?: () => void;
    }
  | undefined;

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'inbox.listRejected') return mockListRejected(input);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: NonNullable<typeof mockUnrejectOpts>
  ) => {
    const key = path.join('.');
    if (key === 'inbox.unreject') {
      mockUnrejectOpts = opts;
      return { mutate: mockUnrejectMutate, isPending: false, variables: undefined };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    setData: mockSetData,
    invalidate: mockInvalidate,
  }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockUnrejectOpts = undefined;
});

describe('RejectedTab — PRD-138', () => {
  it('renders rows from listRejected', () => {
    mockListRejected.mockReturnValue({
      data: {
        items: [makeRow(), makeRow({ versionId: 2, title: 'Lentil dahl' })],
        nextCursor: null,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <RejectedTab now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByText('Banana pancakes')).toBeInTheDocument();
    expect(screen.getByText('Lentil dahl')).toBeInTheDocument();
  });

  it('shows the empty-state copy when listRejected returns []', () => {
    mockListRejected.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <RejectedTab now={FIXED_NOW} />
      </Wrapper>
    );
    expect(screen.getByText(/No rejected drafts/i)).toBeInTheDocument();
  });

  it('invokes Undo and surfaces a success toast on { ok: true }', async () => {
    mockListRejected.mockReturnValue({
      data: { items: [makeRow()], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <RejectedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Undo rejection/i }));
    expect(mockUnrejectMutate).toHaveBeenCalledWith({ versionId: 1 });
    mockUnrejectOpts?.onSuccess?.({ ok: true });
    await waitFor(() => {
      expect(screen.getByText('Restored to Drafts.')).toBeInTheDocument();
    });
  });

  it('rolls back optimistic update + surfaces an error toast on onError', async () => {
    const snapshot = { items: [makeRow()], nextCursor: null };
    mockListRejected.mockReturnValue({
      data: snapshot,
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <RejectedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Undo rejection/i }));
    mockUnrejectOpts?.onError?.(new Error('boom'), { versionId: 1 }, { snapshot });
    expect(mockSetData).toHaveBeenCalledWith(
      ['inbox', 'listRejected'],
      expect.objectContaining({}),
      expect.any(Function)
    );
    await waitFor(() => {
      expect(screen.getByText(/Couldn’t undo: boom/i)).toBeInTheDocument();
    });
  });

  it('passes filter chip toggles into the query input', async () => {
    mockListRejected.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(
      <Wrapper>
        <RejectedTab now={FIXED_NOW} />
      </Wrapper>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    const inputsSeen = mockListRejected.mock.calls.map(([input]) => input);
    expect(
      inputsSeen.some((i) => Array.isArray(i.reasons) && i.reasons.includes('duplicate'))
    ).toBe(true);
  });
});
