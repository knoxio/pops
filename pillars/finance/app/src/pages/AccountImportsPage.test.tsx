/**
 * `/accounts/:id/imports` (POPS-2919): the three account shapes, what the
 * pending draft adds, the sync's disabled reasons and its staged result,
 * and the whole-config write.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accountsList: vi.fn(),
  currenciesList: vi.fn(),
  getConfig: vi.fn(),
  writeConfig: vi.fn(),
  listBatches: vi.fn(),
  draftsList: vi.fn(),
  draftsDiscard: vi.fn(),
  draftsClaim: vi.fn(),
  triggerSync: vi.fn(),
  getSyncJob: vi.fn(),
}));
vi.mock('../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => mocks.accountsList(...args),
  currenciesList: (...args: unknown[]) => mocks.currenciesList(...args),
  accountImportsGetConfig: (...args: unknown[]) => mocks.getConfig(...args),
  accountImportsWriteConfig: (...args: unknown[]) => mocks.writeConfig(...args),
  accountImportsListBatches: (...args: unknown[]) => mocks.listBatches(...args),
  importDraftsList: (...args: unknown[]) => mocks.draftsList(...args),
  importDraftsDiscard: (...args: unknown[]) => mocks.draftsDiscard(...args),
  importDraftsClaim: (...args: unknown[]) => mocks.draftsClaim(...args),
  accountImportsTriggerSync: (...args: unknown[]) => mocks.triggerSync(...args),
  accountImportsGetSyncJob: (...args: unknown[]) => mocks.getSyncJob(...args),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { makeDraft } from '../components/imports/pending/pending-import.test-helpers';
import { NO_BALANCE, NO_IMPORT_STATUS, NO_TRANSACTION_COUNT } from '../test-utils.js';
import { AccountImportsPage } from './AccountImportsPage';

import type { ImportBatchWire, ImportConfigWire } from './account-imports/types';
import type { Account } from './accounts/types';

const ACCOUNT_ID = 'acc-up';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: ACCOUNT_ID,
    name: 'Up Spending',
    kind: 'savings',
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
    ...overrides,
  };
}

function config(overrides: Partial<ImportConfigWire> = {}): ImportConfigWire {
  return {
    accountId: ACCOUNT_ID,
    sourceKind: 'api',
    dialectId: null,
    parserId: null,
    provider: 'up',
    externalAccountRef: 'up-acc-1',
    expectedCadenceDays: 1,
    secretRef: 'UP_API_TOKEN',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function batch(overrides: Partial<ImportBatchWire> = {}): ImportBatchWire {
  return {
    id: 'b1',
    accountId: ACCOUNT_ID,
    sourceKind: 'csv-dialect',
    sourceRef: 'Amex',
    parserVersion: null,
    commitKey: null,
    rowCount: 46,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    checkpointId: null,
    createdAt: '2026-09-04T11:12:00.000Z',
    ...overrides,
  };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function notFound() {
  return {
    data: undefined,
    error: { message: "Import config 'acc-up' not found", code: 'NotFoundError' },
    response: new Response(null, { status: 404 }),
  };
}

function job(status: 'running' | 'completed', staged = 0, settled = 0) {
  return {
    id: 'job-1',
    accountId: ACCOUNT_ID,
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
            settled,
            settleRefused: 0,
            alreadyHeld: 0,
            draftId: staged > 0 ? 'd-live' : null,
            warnings: [],
          }
        : null,
    error: null,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/finance/accounts/${ACCOUNT_ID}/imports`]}>
        <Routes>
          <Route path="/finance/accounts/:id/imports" element={<AccountImportsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountsList.mockResolvedValue(
    ok({ data: [account()], pagination: { total: 1, limit: 500, offset: 0, hasMore: false } })
  );
  mocks.currenciesList.mockResolvedValue(ok({ data: [] }));
  mocks.getConfig.mockResolvedValue(ok({ data: config() }));
  mocks.listBatches.mockResolvedValue(ok({ data: [], nextBefore: null }));
  mocks.draftsList.mockResolvedValue(ok({ data: [] }));
  mocks.writeConfig.mockResolvedValue(ok({ data: config(), message: 'Import config saved' }));
});

describe('the three account shapes', () => {
  it('a synced account names its provider, its connection and the secret it reads', async () => {
    renderPage();
    expect(await screen.findByText('Imports — Up Spending')).toBeDefined();
    expect(screen.getByText('Provider API')).toBeDefined();
    expect(screen.getByText('Up live feed')).toBeDefined();
    expect(screen.getByText('Connected')).toBeDefined();
    expect(screen.getByText('as up-acc-1')).toBeDefined();
    expect(screen.getByText('UP_API_TOKEN')).toBeDefined();
    expect(screen.getByText('Daily')).toBeDefined();
    expect(screen.getByRole('button', { name: /Sync now/ })).not.toHaveProperty('disabled', true);
  });

  it('a file-fed account names its dialect and cannot be synced', async () => {
    mocks.getConfig.mockResolvedValue(
      ok({
        data: config({
          sourceKind: 'csv-dialect',
          dialectId: 'Amex',
          provider: null,
          secretRef: null,
          externalAccountRef: null,
        }),
      })
    );
    renderPage();
    expect(await screen.findByText('CSV export')).toBeDefined();
    expect(screen.getByText('Amex')).toBeDefined();
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
  });

  it('an account nothing feeds says so, and offers to set a source up', async () => {
    mocks.getConfig.mockResolvedValue(notFound());
    renderPage();
    expect(await screen.findByText(/Nothing feeds Up Spending on its own/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Set up/ })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
  });

  it('an Up account whose secret is missing shows the token as missing and refuses the sync', async () => {
    mocks.getConfig.mockResolvedValue(ok({ data: config({ secretRef: null }) }));
    renderPage();
    expect(await screen.findByText('Token missing')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
  });
});

describe('status and history', () => {
  it('reports when the account was last fed, the last sync beside it, and what it covers', async () => {
    mocks.accountsList.mockResolvedValue(
      ok({
        data: [
          account({
            importStatus: {
              lastImportAt: '2026-09-10T01:00:00.000Z',
              lastSyncedAt: '2026-09-10T01:00:00.000Z',
              lastBatchId: null,
              newestTransactionDate: '2026-09-09',
              span: { from: '2026-06-01', to: '2026-09-09' },
              cadenceDays: 7,
              source: { kind: 'api', provider: 'up' },
            },
          }),
        ],
        pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
      })
    );
    renderPage();
    expect(await screen.findByText('Weekly')).toBeDefined();
    expect(screen.getByText(/^Last sync /)).toBeDefined();
    expect(screen.getByText(/^9 Sept? 2026$/)).toBeDefined();
  });

  it("shows the account's pending draft in Status, and nothing about drafts when there is none", async () => {
    const { unmount } = renderPage();
    expect(await screen.findByText('Never fed')).toBeDefined();
    expect(screen.queryByText('Waiting for review')).toBeNull();
    unmount();

    mocks.draftsList.mockResolvedValue(
      ok({
        data: [
          makeDraft({
            id: 'd-live',
            accountId: ACCOUNT_ID,
            state: 'live',
            source: { kind: 'live', provider: 'up' },
            rowCount: 11,
            unresolvedCount: 2,
          }),
          makeDraft({ id: 'd-other', accountId: 'acc-other' }),
        ],
      })
    );
    renderPage();
    expect(await screen.findByText('Waiting for review')).toBeDefined();
    const cards = screen.getAllByTestId('pending-import-card');
    expect(cards).toHaveLength(1);
    expect(within(cards[0]!).getByText(/11 transactions arrived/)).toBeDefined();
  });

  it('lists batches newest first with their span, and loads older ones on demand', async () => {
    mocks.listBatches
      .mockResolvedValueOnce(ok({ data: [batch()], nextBefore: '2026-09-04T11:12:00.000Z' }))
      .mockResolvedValueOnce(
        ok({
          data: [
            batch({
              id: 'b0',
              sourceKind: 'api',
              sourceRef: 'up',
              rowCount: 3,
              checkpointId: 'cp-1',
              dateFrom: '2026-07-01',
              dateTo: '2026-07-01',
            }),
          ],
          nextBefore: null,
        })
      );
    renderPage();
    expect(await screen.findByText('CSV · Amex')).toBeDefined();
    expect(screen.getByText('1 Aug 2026 – 31 Aug 2026')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Load older batches' }));
    expect(await screen.findByText('API · up')).toBeDefined();
    expect(screen.getByText(/^1 Jul(y)? 2026$/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Checkpoint' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Load older batches' })).toBeNull();
  });
});

describe('actions', () => {
  it('Sync now follows the job and reports what it staged', async () => {
    mocks.triggerSync.mockResolvedValue(ok({ data: job('running') }));
    mocks.getSyncJob.mockResolvedValue(ok({ data: job('completed', 3, 1) }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }));
    await waitFor(() =>
      expect(mocks.triggerSync).toHaveBeenCalledWith({ path: { id: ACCOUNT_ID } })
    );
    expect(await screen.findByText('3 staged for review, 1 settled.')).toBeDefined();
    await waitFor(() => expect(mocks.draftsList).toHaveBeenCalledTimes(2));
  });

  it('Import file goes to the wizard pre-scoped to this account', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /Import file/ });
    expect(link.getAttribute('href')).toBe(`/finance/import?account=${ACCOUNT_ID}`);
  });

  it('writes the whole config, sending only what the chosen kind uses', async () => {
    mocks.getConfig.mockResolvedValue(notFound());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Set up/ }));
    expect(await screen.findByText('How Up Spending is fed')).toBeDefined();

    const save = screen.getByRole('button', { name: 'Save source' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Dialect'), { target: { value: 'ANZ' } });
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.writeConfig).toHaveBeenCalledWith({
        path: { id: ACCOUNT_ID },
        body: {
          sourceKind: 'csv-dialect',
          dialectId: 'ANZ',
          parserId: null,
          provider: null,
          externalAccountRef: null,
          expectedCadenceDays: null,
          secretRef: null,
        },
      })
    );
    await waitFor(() => expect(screen.queryByText('How Up Spending is fed')).toBeNull());
  });
});
