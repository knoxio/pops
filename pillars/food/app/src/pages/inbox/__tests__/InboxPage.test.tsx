/**
 * PRD-134 — RTL coverage for the page shell.
 *
 *   - default `?tab` → Drafts tab body
 *   - `?tab=rejected` → Rejected tab body
 *   - invalid `?tab` is normalised to `drafts` and the URL is updated
 *   - tab change pushes the new `?tab` into the URL
 *   - pendingCount renders from `inbox.pendingCount`
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const inboxListMock = vi.hoisted(() => vi.fn());
const inboxListRejectedMock = vi.hoisted(() => vi.fn());
const inboxListFailedMock = vi.hoisted(() => vi.fn());
const inboxPendingCountMock = vi.hoisted(() => vi.fn());
const inboxFailedErrorCodesMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  inboxList: inboxListMock,
  inboxListRejected: inboxListRejectedMock,
  inboxListFailed: inboxListFailedMock,
  inboxPendingCount: inboxPendingCountMock,
  inboxFailedErrorCodes: inboxFailedErrorCodesMock,
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
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    []
  );
  return (
    <QueryClientProvider client={client}>
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
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  inboxListMock.mockResolvedValue({ data: { items: [], nextCursor: null } });
  inboxListRejectedMock.mockResolvedValue({ data: { items: [], nextCursor: null } });
  inboxListFailedMock.mockResolvedValue({ data: { items: [], nextCursor: null } });
  inboxPendingCountMock.mockResolvedValue({ data: { count: 5 } });
  inboxFailedErrorCodesMock.mockResolvedValue({ data: { items: [] } });
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

  it('renders the pending-count from inbox.pendingCount', async () => {
    render(<Wrapper initial="/food/inbox" />);
    await waitFor(() => {
      expect(screen.getByTestId('inbox-pending-count').textContent).toMatch(/5 drafts/);
    });
  });
});
