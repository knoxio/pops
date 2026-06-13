/**
 * PRD-134 — RTL coverage for the page shell.
 *
 *   - default `?tab` → Drafts tab body
 *   - `?tab=rejected` → Rejected tab body
 *   - invalid `?tab` is normalised to `drafts` and the URL is updated
 *   - tab change pushes the new `?tab` into the URL
 *   - pendingCount renders from `food.inbox.pendingCount`
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const mockListQuery = vi.fn(() => ({
  data: { items: [], nextCursor: null },
  isLoading: false,
  isError: false,
  error: null,
}));
const mockListRejected = vi.fn(() => ({
  data: { items: [], nextCursor: null },
  isLoading: false,
  isError: false,
  error: null,
}));
const mockListFailed = vi.fn(() => ({
  data: { items: [], nextCursor: null },
  isLoading: false,
  isError: false,
  error: null,
}));
const mockPendingCount = vi.fn(() => ({
  data: { count: 5 },
  isLoading: false,
  isError: false,
  error: null,
}));
const mockFailedErrorCodes = vi.fn(() => ({ data: [], isLoading: false }));

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'inbox.list') return mockListQuery(input);
    if (key === 'inbox.pendingCount') return mockPendingCount();
    if (key === 'inbox.listRejected') return mockListRejected(input);
    if (key === 'inbox.listFailed') return mockListFailed(input);
    if (key === 'inbox.failedErrorCodes') return mockFailedErrorCodes();
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
  usePillarUtils: () => ({ setData: vi.fn(), invalidate: vi.fn() }),
}));

import { InboxPage } from '../InboxPage.js';

function LocationProbe(): ReactElement {
  const location = useLocation();
  return (
    <div data-testid="location-probe">
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
}

function Wrapper({ initial }: { initial: string }): ReactElement {
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
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route
            path="/food/inbox"
            element={<InboxPage now={new Date('2026-06-10T18:00:00Z')} />}
          />
        </Routes>
        <LocationProbe />
        <Toaster />
      </MemoryRouter>
    </I18nextProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InboxPage — PRD-134', () => {
  it('defaults to the Drafts tab when no ?tab is set', () => {
    render(<Wrapper initial="/food/inbox" />);
    expect(screen.getByTestId('drafts-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('rejected-tab')).not.toBeInTheDocument();
  });

  it('renders the Rejected tab when ?tab=rejected', () => {
    render(<Wrapper initial="/food/inbox?tab=rejected" />);
    expect(screen.getByTestId('rejected-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('drafts-tab')).not.toBeInTheDocument();
  });

  it('normalises an invalid ?tab to drafts and rewrites the URL', async () => {
    render(<Wrapper initial="/food/inbox?tab=garbage" />);
    expect(screen.getByTestId('drafts-tab')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toMatch(/tab=drafts/);
    });
  });

  it('pushes the new ?tab into the URL on tab change', async () => {
    render(<Wrapper initial="/food/inbox" />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('inbox-tab-failed'));
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toMatch(/tab=failed/);
    });
    expect(screen.getByTestId('failed-tab')).toBeInTheDocument();
  });

  it('renders the pending-count from food.inbox.pendingCount', () => {
    render(<Wrapper initial="/food/inbox" />);
    expect(screen.getByTestId('inbox-pending-count').textContent).toMatch(/5 drafts/);
  });
});
