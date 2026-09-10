import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  discard: vi.fn(),
  claim: vi.fn(),
  accountsList: vi.fn(),
}));
vi.mock('../../../finance-api/index.js', () => ({
  importDraftsList: (...args: unknown[]) => mocks.list(...args),
  importDraftsDiscard: (...args: unknown[]) => mocks.discard(...args),
  importDraftsClaim: (...args: unknown[]) => mocks.claim(...args),
  accountsList: (...args: unknown[]) => mocks.accountsList(...args),
}));

import { PendingImports } from '../../../pages/dashboard/PendingImports';
import { NO_BALANCE, NO_IMPORT_STATUS, NO_TRANSACTION_COUNT } from '../../../test-utils.js';
import { ContinuePending } from '../upload-step/ContinuePending';
import { makeDraft } from './pending-import.test-helpers';
import { PendingImportList } from './PendingImportList';

import type { Account } from '../../../pages/accounts/types';

const AMEX: Account = {
  id: 'acc-1',
  name: 'Amex',
  kind: 'checking',
  currency: 'AUD',
  archivedAt: null,
  displayOrder: 0,
  entityId: null,
  entityDisplayName: null,
  entityDisplayNameStale: false,
  entityColour: null,
  entityAvatarAssetId: null,
  resolvedEntityId: null,
  balance: NO_BALANCE,
  importStatus: NO_IMPORT_STATUS,
  transactionCount: NO_TRANSACTION_COUNT,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

let lastLocation = '';
function LocationSpy() {
  lastLocation = useLocation().pathname + useLocation().search;
  return null;
}

function renderWith(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/finance']}>
        <LocationSpy />
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function drafts(n: number) {
  return Array.from({ length: n }, (_, i) =>
    makeDraft({ id: `d${i}`, savedAt: `2026-09-0${(i % 9) + 1}T00:00:00.000Z` })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountsList.mockResolvedValue(
    ok({ data: [AMEX], pagination: { total: 1, limit: 500, offset: 0, hasMore: false } })
  );
  mocks.discard.mockResolvedValue({
    data: undefined,
    error: undefined,
    response: new Response(null, { status: 204 }),
  });
  mocks.claim.mockResolvedValue(ok({ data: makeDraft({ state: 'open' }) }));
});

describe('PendingImportList', () => {
  it('caps the cards at max and counts the rest', async () => {
    mocks.list.mockResolvedValue(ok({ data: [] }));
    const items = drafts(7).map((draft) => ({
      draft,
      account: { id: 'acc-1', name: 'Amex', kind: 'checking' as const },
    }));
    renderWith(<PendingImportList items={items} max={5} />);
    expect(screen.getAllByTestId('pending-import-card')).toHaveLength(5);
    expect(screen.getByText('and 2 more, on the import page')).toBeDefined();
  });

  it('Resume navigates to the draft; Discard asks first, then deletes', async () => {
    mocks.list.mockResolvedValue(ok({ data: [] }));
    const items = [
      {
        draft: makeDraft({ id: 'd9' }),
        account: { id: 'acc-1', name: 'Amex', kind: 'checking' as const },
      },
    ];
    renderWith(<PendingImportList items={items} />);

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect(mocks.discard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Discard' }).at(-1)!);
    await waitFor(() => expect(mocks.discard).toHaveBeenCalledWith({ path: { id: 'd9' } }));

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(lastLocation).toBe('/finance/import?draft=d9');
  });

  it('Take over claims with force and then opens the draft', async () => {
    mocks.list.mockResolvedValue(ok({ data: [] }));
    const items = [
      {
        draft: makeDraft({ id: 'd2', state: 'left-open', ownerSeenAt: '2026-09-01T00:00:00Z' }),
        account: { id: 'acc-1', name: 'Amex', kind: 'checking' as const },
      },
    ];
    renderWith(<PendingImportList items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    await waitFor(() => expect(lastLocation).toBe('/finance/import?draft=d2'));
    expect(mocks.claim.mock.calls[0]?.[0]).toMatchObject({
      path: { id: 'd2' },
      body: { force: true },
    });
  });
});

describe('the two entry points', () => {
  it('the dashboard section renders nothing while loading or when nothing is pending', async () => {
    mocks.list.mockResolvedValue(ok({ data: [] }));
    const { container } = renderWith(<PendingImports />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
    expect(container.textContent).toBe('');
  });

  it('the dashboard section lists up to five cards under a heading with the total', async () => {
    mocks.list.mockResolvedValue(ok({ data: drafts(6) }));
    renderWith(<PendingImports />);
    await screen.findByRole('heading', { name: 'Pending imports' });
    expect(screen.getByText('6 imports waiting on you')).toBeDefined();
    expect(screen.getAllByTestId('pending-import-card')).toHaveLength(5);
  });

  it('the first step shows the continue panel and the divider only when something is pending', async () => {
    mocks.list.mockResolvedValue(ok({ data: [] }));
    const { container, unmount } = renderWith(<ContinuePending />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
    expect(container.textContent).toBe('');
    unmount();

    mocks.list.mockResolvedValue(ok({ data: drafts(2) }));
    renderWith(<ContinuePending />);
    await screen.findByText('Continue where you left off');
    expect(screen.getByText('Or start a new import')).toBeDefined();
    expect(screen.getAllByTestId('pending-import-card')).toHaveLength(2);
  });

  it('drops a draft whose account is unknown rather than rendering a nameless card', async () => {
    mocks.list.mockResolvedValue(
      ok({ data: [makeDraft({ id: 'orphan', accountId: 'acc-gone' })] })
    );
    const { container } = renderWith(<PendingImports />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.accountsList).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
