/**
 * The import page's draft gate (finance ADR-005): a `?draft=` URL hydrates
 * the wizard from the server and claims it, an unusable draft offers only
 * Discard, a fresh wizard creates its draft on the first parsed rows, and a
 * reload at Final Review after a failed commit lands back on Final Review
 * with every pending change intact (the POPS-3159 class).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accountsList: vi.fn(),
  draftsGet: vi.fn(),
  draftsClaim: vi.fn(),
  draftsCreate: vi.fn(),
  draftsWrite: vi.fn(),
  draftsRelease: vi.fn(),
  draftsDiscard: vi.fn(),
  draftsHeartbeat: vi.fn(),
  process: vi.fn(),
  progress: vi.fn(),
}));
vi.mock('../finance-api/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../finance-api/index.js')>()),
  accountsList: (...args: unknown[]) => mocks.accountsList(...args),
  importDraftsGet: (...args: unknown[]) => mocks.draftsGet(...args),
  importDraftsClaim: (...args: unknown[]) => mocks.draftsClaim(...args),
  importDraftsCreate: (...args: unknown[]) => mocks.draftsCreate(...args),
  importDraftsWrite: (...args: unknown[]) => mocks.draftsWrite(...args),
  importDraftsRelease: (...args: unknown[]) => mocks.draftsRelease(...args),
  importDraftsDiscard: (...args: unknown[]) => mocks.draftsDiscard(...args),
  importDraftsHeartbeat: (...args: unknown[]) => mocks.draftsHeartbeat(...args),
  importsProcessImport: (...args: unknown[]) => mocks.process(...args),
  importsGetImportProgress: (...args: unknown[]) => mocks.progress(...args),
}));

import { resetOwnerTokenForTests } from '../store/import-draft-owner';
import { toDraftPayload } from '../store/import-draft-payload';
import { initialState } from '../store/import-store-types';
import { useImportStore } from '../store/importStore';
import { NO_BALANCE, NO_IMPORT_STATUS, NO_TRANSACTION_COUNT } from '../test-utils.js';
import { ImportPage } from './ImportPage';

import type { ParsedTransaction } from '@pops/finance';

import type { Account } from './accounts/types';

const AMEX: Account = {
  id: 'acc-amex',
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

function makeParsed(checksum: string): ParsedTransaction {
  return {
    date: '2026-01-15',
    description: `TXN ${checksum}`,
    amount: -10,
    dialectAccountLabel: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
  };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) };
}

function failure(status: number, code: string, message: string) {
  return { data: undefined, error: { message, code }, response: new Response(null, { status }) };
}

function draftOn(payloadOverrides: Record<string, unknown>) {
  const payload = {
    ...toDraftPayload({ ...useImportStore.getState(), ...initialState }),
    ...payloadOverrides,
  };
  return {
    id: 'draft-1',
    accountId: 'acc-amex',
    source: { kind: 'file', dialectId: 'Amex', fileNames: ['jan.csv'] },
    state: 'saved',
    step: payload.currentStep,
    rowCount: 1,
    unresolvedCount: 0,
    span: null,
    balanceReportedCents: null,
    processSessionId: null,
    savedAt: '2026-09-10T00:00:00.000Z',
    createdAt: '2026-09-10T00:00:00.000Z',
    ownerSeenAt: null,
    unusableCause: null,
    unusableReason: null,
    shapeVersion: 1,
    payload,
  };
}

let lastLocation = '';
function LocationSpy() {
  const location = useLocation();
  lastLocation = `${location.pathname}${location.search}`;
  return null;
}

function renderImportPage(url = '/finance/import') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <LocationSpy />
        <Routes>
          <Route path="/finance/import" element={<ImportPage />} />
          <Route path="/finance" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetOwnerTokenForTests();
  sessionStorage.clear();
  useImportStore.setState({ ...initialState });
  mocks.accountsList.mockResolvedValue(
    ok({ data: [AMEX], pagination: { total: 1, limit: 500, offset: 0, hasMore: false } })
  );
  mocks.draftsClaim.mockResolvedValue(ok({ data: { id: 'draft-1', state: 'open' } }));
  mocks.draftsWrite.mockResolvedValue(ok({ data: { id: 'draft-1', state: 'open' } }));
  mocks.draftsRelease.mockResolvedValue({ data: undefined, error: undefined });
  mocks.draftsDiscard.mockResolvedValue({ data: undefined, error: undefined });
  mocks.draftsHeartbeat.mockResolvedValue(ok({ data: { id: 'draft-1', state: 'open' } }));
  mocks.draftsCreate.mockResolvedValue(ok({ data: { id: 'draft-new', state: 'open' } }));
  mocks.process.mockResolvedValue(ok({ sessionId: 'sess-1' }));
  mocks.progress.mockResolvedValue(
    ok({
      sessionId: 'sess-1',
      status: 'processing',
      total: 1,
      processed: 0,
      warnings: [],
    })
  );
});

describe('opening a draft', () => {
  it('hydrates the store from the draft, claims it, and mounts the wizard on the clamped step', async () => {
    mocks.draftsGet.mockResolvedValue(
      ok({
        data: draftOn({
          currentStep: 2,
          accountId: 'acc-amex',
          accountName: 'Amex',
          sourceFileNames: ['jan.csv'],
          headers: ['Date', 'Amount'],
          rows: [{ Date: '01/01/2026', Amount: '-10.00' }],
        }),
      })
    );
    renderImportPage('/finance/import?draft=draft-1');

    await waitFor(() => expect(mocks.draftsClaim).toHaveBeenCalledOnce());
    expect(mocks.draftsClaim.mock.calls[0]?.[0]).toMatchObject({
      path: { id: 'draft-1' },
      body: { force: false },
    });
    await waitFor(() => expect(useImportStore.getState().currentStep).toBe(2));
    expect(useImportStore.getState()).toMatchObject({
      draftId: 'draft-1',
      accountId: 'acc-amex',
      sourceFileNames: ['jan.csv'],
    });
    expect(useImportStore.getState().files).toEqual([]);
  });

  it('does not re-read a draft the store already holds (same-session navigation)', async () => {
    useImportStore.setState({
      ...initialState,
      draftId: 'draft-1',
      currentStep: 2,
      rows: [{ a: '1' }],
      headers: ['a'],
      accountId: 'acc-amex',
    });
    renderImportPage('/finance/import?draft=draft-1');
    await waitFor(() => expect(screen.getByText('Map')).toBeDefined());
    expect(mocks.draftsGet).not.toHaveBeenCalled();
    expect(useImportStore.getState().currentStep).toBe(2);
  });

  it('puts the draft the store holds back into a URL that lost it', async () => {
    useImportStore.setState({
      ...initialState,
      draftId: 'draft-1',
      rows: [{ a: '1' }],
      headers: ['a'],
      accountId: 'acc-amex',
    });
    renderImportPage('/finance/import');
    await waitFor(() => expect(lastLocation).toBe('/finance/import?draft=draft-1'));
    expect(mocks.draftsGet).not.toHaveBeenCalled();
  });

  it('renders an unusable draft as a reason and a Discard button, and mounts no wizard', async () => {
    mocks.draftsGet.mockResolvedValue(
      failure(409, 'DraftUnusable', 'Saved before this version was deployed. Upload it again.')
    );
    renderImportPage('/finance/import?draft=draft-old');

    await screen.findByText('This import cannot be resumed');
    expect(screen.getByText(/Saved before this version was deployed/)).toBeDefined();
    expect(screen.queryByText('Upload')).toBeNull();
    expect(mocks.draftsClaim).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(mocks.draftsDiscard).toHaveBeenCalledOnce());
    await waitFor(() => expect(lastLocation).toBe('/finance/import'));
    await screen.findByText('Upload');
  });

  it('offers to take over a draft another tab holds, and claims with force when asked', async () => {
    mocks.draftsGet.mockResolvedValue(ok({ data: draftOn({ currentStep: 1 }) }));
    mocks.draftsClaim
      .mockResolvedValueOnce(failure(409, 'DraftOwnedElsewhere', 'open elsewhere'))
      .mockResolvedValueOnce(ok({ data: { id: 'draft-1', state: 'open' } }));
    renderImportPage('/finance/import?draft=draft-1');

    await screen.findByText('This import is open in another tab');
    fireEvent.click(screen.getByRole('button', { name: 'Take over here' }));
    await waitFor(() => expect(mocks.draftsClaim).toHaveBeenCalledTimes(2));
    expect(mocks.draftsClaim.mock.calls[1]?.[0]).toMatchObject({ body: { force: true } });
    await screen.findByText('Upload');
  });

  it('drops a draft that is gone from the URL and starts fresh', async () => {
    mocks.draftsGet.mockResolvedValue(failure(404, 'NotFoundError', 'not found'));
    renderImportPage('/finance/import?draft=draft-gone');
    await waitFor(() => expect(lastLocation).toBe('/finance/import'));
    await screen.findByText('Upload');
  });
});

describe('a fresh wizard', () => {
  it('mounts at step 1 and creates a draft once the first rows exist, then carries the id in the URL', async () => {
    renderImportPage('/finance/import');
    await screen.findByText('Upload');
    expect(mocks.draftsGet).not.toHaveBeenCalled();

    useImportStore.getState().setAccount('acc-amex', 'Amex');
    useImportStore.setState({ headers: ['Date'], rows: [{ Date: '01/01/2026' }] });

    await waitFor(() => expect(mocks.draftsCreate).toHaveBeenCalledOnce());
    await waitFor(() => expect(lastLocation).toBe('/finance/import?draft=draft-new'));
    expect(useImportStore.getState().draftId).toBe('draft-new');
  });

  it('pre-selects the account named by ?account= into a fresh wizard only', async () => {
    renderImportPage('/finance/import?account=acc-amex');
    await waitFor(() => expect(useImportStore.getState().accountId).toBe('acc-amex'));
  });

  it('resets a store left over from a committed run', async () => {
    useImportStore.setState({
      ...initialState,
      currentStep: 8,
      rows: [{ a: '1' }],
      commitResult: {
        entitiesCreated: 0,
        rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
        tagRulesApplied: 0,
        transactionsImported: 1,
        transactionsFailed: 0,
        failedDetails: [],
        retroactiveReclassifications: 0,
      },
    });
    renderImportPage('/finance/import');
    await screen.findByText('Upload');
    expect(useImportStore.getState().currentStep).toBe(1);
    expect(useImportStore.getState().commitResult).toBeNull();
  });
});

describe('POPS-3159: a reload at Final Review after a failed commit', () => {
  it('lands back on Final Review with every pending change intact', async () => {
    const parsed = makeParsed('a');
    const confirmed = { ...parsed, transactionType: 'purchase' as const };
    const pendingEntity = { tempId: 'temp:entity:1', name: 'Woolworths', type: 'company' as const };
    const pendingChangeSet = {
      tempId: 'temp:cs:1',
      changeSet: {
        ops: [
          { op: 'add' as const, data: { descriptionPattern: 'WOOL', matchType: 'exact' as const } },
        ],
      },
      appliedAt: '2026-09-10T00:00:00.000Z',
      source: 'review',
    };
    mocks.draftsGet.mockResolvedValue(
      ok({
        data: draftOn({
          currentStep: 7,
          accountId: 'acc-amex',
          accountName: 'Amex',
          sourceFileNames: ['jan.csv'],
          parsedTransactions: [parsed],
          parsedTransactionsFingerprint: 'a',
          processedForFingerprint: 'a',
          processedTransactions: {
            matched: [
              {
                ...parsed,
                status: 'matched',
                entity: { matchType: 'exact', entityId: 'e1', entityName: 'Woolworths' },
              },
            ],
            uncertain: [],
            failed: [],
            skipped: [],
          },
          confirmedTransactions: [confirmed],
          pendingEntities: [pendingEntity],
          pendingChangeSets: [pendingChangeSet],
          manuallyResolvedChecksums: ['a'],
        }),
      })
    );
    renderImportPage('/finance/import?draft=draft-1');

    await waitFor(() => expect(useImportStore.getState().currentStep).toBe(7));
    const state = useImportStore.getState();
    expect(state.pendingEntities).toEqual([pendingEntity]);
    expect(state.pendingChangeSets).toEqual([pendingChangeSet]);
    expect(state.confirmedTransactions).toEqual([confirmed]);
    expect(state.manuallyResolvedChecksums).toEqual(['a']);
    expect(state.commitResult).toBeNull();
    expect(mocks.draftsDiscard).not.toHaveBeenCalled();
  });
});

describe('losing the lease mid-run (POPS-3331)', () => {
  function openDraftOnStepTwo() {
    useImportStore.setState({
      ...initialState,
      draftId: 'draft-1',
      currentStep: 2,
      rows: [{ a: '1' }],
      headers: ['a'],
      accountId: 'acc-amex',
    });
    return renderImportPage('/finance/import?draft=draft-1');
  }

  it('shows the blocking notice when a write is refused, and Take it back reclaims with force and writes again', async () => {
    openDraftOnStepTwo();
    await screen.findByText('Map');
    mocks.draftsWrite.mockResolvedValueOnce(failure(409, 'DraftOwnedElsewhere', 'open elsewhere'));
    useImportStore.getState().nextStep();

    await screen.findByText('This import is open somewhere else now');
    expect(mocks.draftsWrite).toHaveBeenCalledOnce();

    useImportStore.getState().prevStep();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.draftsWrite).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Take it back' }));
    await waitFor(() => expect(mocks.draftsClaim).toHaveBeenCalledOnce());
    expect(mocks.draftsClaim.mock.calls[0]?.[0]).toMatchObject({
      path: { id: 'draft-1' },
      body: { force: true },
    });
    await waitFor(() =>
      expect(screen.queryByText('This import is open somewhere else now')).toBeNull()
    );

    useImportStore.getState().nextStep();
    await waitFor(() => expect(mocks.draftsWrite).toHaveBeenCalledTimes(2));
  });

  it('Leave navigates away without claiming', async () => {
    openDraftOnStepTwo();
    await screen.findByText('Map');
    mocks.draftsWrite.mockResolvedValueOnce(failure(409, 'DraftOwnedElsewhere', 'open elsewhere'));
    useImportStore.getState().nextStep();
    await screen.findByText('This import is open somewhere else now');

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(lastLocation).toBe('/finance'));
    expect(mocks.draftsClaim).not.toHaveBeenCalled();
  });
});
