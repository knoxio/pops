import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  accountsList: vi.fn(),
  triggerSync: vi.fn(),
  getSyncJob: vi.fn(),
}));
vi.mock('../../../finance-api/index.js', () => ({
  importDraftsList: (...args: unknown[]) => mocks.list(...args),
  accountsList: (...args: unknown[]) => mocks.accountsList(...args),
  accountImportsTriggerSync: (...args: unknown[]) => mocks.triggerSync(...args),
  accountImportsGetSyncJob: (...args: unknown[]) => mocks.getSyncJob(...args),
}));

import { NO_BALANCE, NO_IMPORT_STATUS, NO_TRANSACTION_COUNT } from '../../../test-utils.js';
import { makeDraft } from '../pending/pending-import.test-helpers';
import { LiveFeedSection } from './LiveFeedSection';

const UP = {
  id: 'acc-up',
  name: 'Up Spending',
  kind: 'savings' as const,
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
  const location = useLocation();
  lastLocation = location.pathname + location.search;
  return null;
}

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/finance/import']}>
        <LocationSpy />
        <LiveFeedSection
          account={{ id: 'acc-up', name: 'Up Spending', kind: 'savings', currency: 'AUD' }}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function job(status: 'running' | 'completed', staged = 0) {
  return {
    id: 'job-1',
    accountId: 'acc-up',
    trigger: 'manual',
    status,
    from: '2026-09-01',
    to: '2026-09-10',
    startedAt: '2026-09-10T00:00:00.000Z',
    finishedAt: status === 'completed' ? '2026-09-10T00:00:05.000Z' : null,
    result:
      status === 'completed'
        ? {
            fetched: staged,
            staged,
            alreadyStaged: 0,
            alreadyInLedger: 0,
            settled: 0,
            settleRefused: 0,
            alreadyHeld: 0,
            draftId: staged > 0 ? 'd-new' : null,
            warnings: [],
          }
        : null,
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountsList.mockResolvedValue(
    ok({ data: [UP], pagination: { total: 1, limit: 500, offset: 0, hasMore: false } })
  );
});

describe('LiveFeedSection', () => {
  it('shows what has arrived and opens the collecting draft', async () => {
    mocks.list.mockResolvedValue(
      ok({
        data: [
          makeDraft({
            id: 'd-live',
            accountId: 'acc-up',
            state: 'live',
            source: { kind: 'live', provider: 'up' },
            rowCount: 11,
            unresolvedCount: 2,
            balanceReportedCents: 61_215,
            span: { from: '2026-09-02', to: '2026-09-10' },
          }),
        ],
      })
    );
    renderSection();
    expect(await screen.findByText('Waiting from the Up live feed')).toBeDefined();
    expect(screen.getByText('11 transactions')).toBeDefined();
    expect(screen.getByText('$612.15')).toBeDefined();
    expect(screen.getByText('2 need a decision.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Next: process what arrived' }));
    expect(lastLocation).toBe('/finance/import?draft=d-live');
  });

  it('ignores a saved draft of the same account: only the collecting one is what is waiting', async () => {
    mocks.list.mockResolvedValue(
      ok({
        data: [
          makeDraft({
            id: 'd-saved',
            accountId: 'acc-up',
            state: 'saved',
            source: { kind: 'live', provider: 'up' },
          }),
        ],
      })
    );
    renderSection();
    expect(await screen.findByText('Up live feed')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDefined();
  });

  it('Sync now starts a sync, follows the job and refetches the drafts when it lands', async () => {
    mocks.list.mockResolvedValueOnce(ok({ data: [] })).mockResolvedValue(
      ok({
        data: [
          makeDraft({
            id: 'd-new',
            accountId: 'acc-up',
            state: 'live',
            source: { kind: 'live', provider: 'up' },
            rowCount: 3,
          }),
        ],
      })
    );
    mocks.triggerSync.mockResolvedValue(ok({ data: job('running') }));
    mocks.getSyncJob
      .mockResolvedValueOnce(ok({ data: job('running') }))
      .mockResolvedValue(ok({ data: job('completed', 3) }));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(mocks.triggerSync).toHaveBeenCalledWith({ path: { id: 'acc-up' } }));
    await waitFor(() => expect(mocks.getSyncJob).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(
      await screen.findByText('Waiting from the Up live feed', {}, { timeout: 4000 })
    ).toBeDefined();
    expect(screen.getByText('3 transactions')).toBeDefined();
  });

  it('says when Up had nothing new', async () => {
    mocks.list.mockResolvedValue(ok({ data: [] }));
    mocks.triggerSync.mockResolvedValue(ok({ data: job('completed', 0) }));
    mocks.getSyncJob.mockResolvedValue(ok({ data: job('completed', 0) }));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText(/Up had nothing new/)).toBeDefined();
  });
});
