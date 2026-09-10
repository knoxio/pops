import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Store mock state ---

const mockPrevStep = vi.fn();
const mockNextStep = vi.fn();
const mockSetCommitResult = vi.fn();
const mockSetDraftId = vi.fn();

let storeState: Record<string, unknown> = {};

vi.mock('../../store/importStore', () => ({
  useImportStore: (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState,
}));

// --- finance SDK mock ---

const { mockCommitImport } = vi.hoisted(() => ({ mockCommitImport: vi.fn() }));

vi.mock('../../finance-api/index.js', () => ({
  accountsList: async () => ({
    data: { data: [], pagination: { total: 0, limit: 500, offset: 0, hasMore: false } },
    error: undefined,
  }),
  importsCommitImport: (...args: unknown[]) => mockCommitImport(...args),
}));

vi.mock('../../lib/commit-payload', () => ({
  importSourceFor: vi.fn(() => ({ kind: 'csv-dialect', dialectId: 'Amex' })),
  buildCommitPayload: vi.fn(
    (inputs: {
      pendingEntities: unknown[];
      pendingChangeSets: Array<{ changeSet: unknown }>;
      pendingTagRuleChangeSets: Array<{ changeSet: unknown }>;
      confirmedTransactions: unknown[];
      source: unknown;
    }) => ({
      entities: inputs.pendingEntities,
      changeSets: inputs.pendingChangeSets.map((pcs) => pcs.changeSet),
      tagRuleChangeSets: inputs.pendingTagRuleChangeSets.map((pcs) => pcs.changeSet),
      transactions: inputs.confirmedTransactions,
      source: inputs.source,
    })
  ),
}));

import { FinalReviewStep } from './FinalReviewStep';

// --- Helpers ---

function renderStep(): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <FinalReviewStep />
    </QueryClientProvider>
  );
}

function makeStoreState(overrides: Partial<typeof storeState> = {}) {
  return {
    pendingEntities: [],
    pendingChangeSets: [],
    pendingTagRuleChangeSets: [],
    confirmedTransactions: [],
    processedTransactions: {
      matched: [],
      uncertain: [],
      failed: [],
      skipped: [],
    },
    accountName: 'ANZ Everyday',
    commitResult: null,
    prevStep: mockPrevStep,
    nextStep: mockNextStep,
    setCommitResult: mockSetCommitResult,
    draftId: 'draft-1',
    setDraftId: mockSetDraftId,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeState = makeStoreState();
  mockCommitImport.mockResolvedValue({
    data: { data: {}, message: 'ok' },
    error: undefined,
  });
});

/** Open the confirmation dialog via the footer button, then confirm inside it. */
function clickCommitAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Approve & Commit All' }));
  const dialog = screen.getByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Approve & Commit All' }));
}

// --- Tests ---

describe('FinalReviewStep', () => {
  it('renders empty state when no pending changes', () => {
    render(renderStep());
    expect(screen.getByText('No pending changes to review.')).toBeDefined();
  });

  it('hides sections with zero items', () => {
    render(renderStep());
    expect(screen.queryByText('New Entities')).toBeNull();
    expect(screen.queryByText('Classification Rule Changes')).toBeNull();
    expect(screen.queryByText('Transactions to Import')).toBeNull();
    expect(screen.queryByText('Tag Assignments')).toBeNull();
  });

  it('shows new entities section when pendingEntities present', () => {
    storeState = makeStoreState({
      pendingEntities: [
        { tempId: 'temp:entity:1', name: 'Woolworths', type: 'company' },
        { tempId: 'temp:entity:2', name: 'Coles', type: 'company' },
      ],
    });
    render(renderStep());
    expect(screen.getByText('Woolworths')).toBeDefined();
    expect(screen.getByText('Coles')).toBeDefined();
    expect(screen.getByText('(2)')).toBeDefined();
  });

  it('shows rule changes with correct badges', () => {
    storeState = makeStoreState({
      pendingChangeSets: [
        {
          tempId: 'pcs-1',
          changeSet: {
            source: 'import',
            ops: [
              { op: 'add', data: { descriptionPattern: 'WOOLWORTHS*' } },
              { op: 'edit', id: 'rule-abc123', data: { entityName: 'Coles' } },
              { op: 'disable', id: 'rule-def456' },
            ],
          },
        },
      ],
    });
    render(renderStep());
    expect(screen.getByText('Add')).toBeDefined();
    expect(screen.getByText('Edit')).toBeDefined();
    expect(screen.getByText('Disable')).toBeDefined();
    expect(screen.getByText('WOOLWORTHS*')).toBeDefined();
    expect(screen.getByText('Coles')).toBeDefined();
    expect(screen.getByText('Rule rule-def')).toBeDefined();
  });

  it('shows transaction breakdown with AC labels (matched/corrected/manual)', () => {
    storeState = makeStoreState({
      confirmedTransactions: Array.from({ length: 5 }, (_, i) => ({ id: `t${i}` })),
      processedTransactions: {
        matched: [{ id: 'm1' }, { id: 'm2' }],
        uncertain: [{ id: 'u1' }],
        failed: [{ id: 'f1' }, { id: 'f2' }],
        skipped: [],
      },
    });
    render(renderStep());
    expect(screen.getByText('Matched:')).toBeDefined();
    expect(screen.getByText('Corrected:')).toBeDefined();
    expect(screen.getByText('Manual:')).toBeDefined();
    // Should NOT show internal bucket names
    expect(screen.queryByText('Uncertain:')).toBeNull();
    expect(screen.queryByText('Failed:')).toBeNull();
  });

  it('names the account duplicates were matched against, only when some were skipped (POPS-2820)', () => {
    storeState = makeStoreState({
      confirmedTransactions: Array.from({ length: 3 }, (_, i) => ({ id: `t${i}` })),
      processedTransactions: {
        matched: [{ id: 'm1' }],
        uncertain: [],
        failed: [],
        skipped: [{ id: 's1' }, { id: 's2' }],
      },
      accountName: 'ANZ Everyday',
    });
    render(renderStep());
    expect(
      screen.getByText(/matched against this account only, not the rest of your ledger/)
    ).toBeDefined();
    expect(screen.getByText(/ANZ Everyday/)).toBeDefined();
  });

  it('omits the duplicate-scoping note when nothing was skipped', () => {
    storeState = makeStoreState({
      confirmedTransactions: [{ id: 't0' }],
      processedTransactions: {
        matched: [{ id: 'm1' }],
        uncertain: [],
        failed: [],
        skipped: [],
      },
    });
    render(renderStep());
    expect(screen.queryByText(/matched against this account only/)).toBeNull();
  });

  it('shows tag assignment count', () => {
    storeState = makeStoreState({
      confirmedTransactions: [
        { id: 't1', tags: ['food', 'groceries'] },
        { id: 't2', tags: ['transport'] },
        { id: 't3' },
      ],
    });
    render(renderStep());
    expect(screen.getByText(/3 tags will be applied across 2 transactions/)).toBeDefined();
  });

  it('defaults sections to collapsed when count > 10', () => {
    const manyEntities = Array.from({ length: 12 }, (_, i) => ({
      tempId: `temp:entity:${i}`,
      name: `Entity ${i}`,
      type: 'company',
    }));
    storeState = makeStoreState({ pendingEntities: manyEntities });
    render(renderStep());
    // Section header visible but items not rendered (collapsed)
    expect(screen.getByText('(12)')).toBeDefined();
    expect(screen.queryByText('Entity 0')).toBeNull();
  });

  it('expands collapsed sections on click', () => {
    const manyEntities = Array.from({ length: 12 }, (_, i) => ({
      tempId: `temp:entity:${i}`,
      name: `Entity ${i}`,
      type: 'company',
    }));
    storeState = makeStoreState({ pendingEntities: manyEntities });
    render(renderStep());
    // Click section header to expand
    fireEvent.click(screen.getByText('New Entities').closest('button')!);
    expect(screen.getByText('Entity 0')).toBeDefined();
  });

  it("shows 'Approve & Commit All' button instead of 'Continue to Import'", () => {
    render(renderStep());
    expect(screen.getByText('Approve & Commit All')).toBeDefined();
    expect(screen.queryByText('Continue to Import')).toBeNull();
  });

  it('opens a confirmation dialog summarizing totals instead of committing immediately', () => {
    storeState = makeStoreState({
      pendingEntities: [{ tempId: 'temp:entity:1', name: 'Woolworths', type: 'company' }],
      pendingChangeSets: [{ tempId: 'pcs-1', changeSet: { ops: [{ op: 'add', data: {} }] } }],
      confirmedTransactions: [
        { id: 't1', checksum: 'abc' },
        { id: 't2', checksum: 'def' },
      ],
    });
    render(renderStep());
    fireEvent.click(screen.getByRole('button', { name: 'Approve & Commit All' }));

    expect(mockCommitImport).not.toHaveBeenCalled();
    const dialogText = screen.getByRole('alertdialog').textContent ?? '';
    expect(dialogText).toContain('1 entity');
    expect(dialogText).toContain('1 classification rule change');
    expect(dialogText).toContain('2 transactions');
  });

  it('calls importsCommitImport with the built payload + a commitKey on confirm', async () => {
    storeState = makeStoreState({
      confirmedTransactions: [{ id: 't1', checksum: 'abc' }],
    });
    render(renderStep());
    clickCommitAndConfirm();
    await waitFor(() =>
      expect(mockCommitImport).toHaveBeenCalledWith({
        body: expect.objectContaining({
          transactions: [{ id: 't1', checksum: 'abc' }],
          commitKey: expect.any(String),
        }),
      })
    );
  });

  it('reuses the same commitKey across a retry (idempotent resubmit)', async () => {
    storeState = makeStoreState({
      confirmedTransactions: [{ id: 't1', checksum: 'abc' }],
    });
    mockCommitImport.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'timeout' },
      response: { status: 500 } as Response,
    });
    render(renderStep());
    clickCommitAndConfirm();
    await waitFor(() => expect(mockCommitImport).toHaveBeenCalledTimes(1));

    clickCommitAndConfirm();
    await waitFor(() => expect(mockCommitImport).toHaveBeenCalledTimes(2));

    const [firstCall, secondCall] = mockCommitImport.mock.calls as [
      [{ body: { commitKey: string } }],
      [{ body: { commitKey: string } }],
    ];
    expect(secondCall[0].body.commitKey).toBe(firstCall[0].body.commitKey);
  });

  it('auto-advances to Summary on successful commit', async () => {
    const resultData = {
      entitiesCreated: 2,
      rulesApplied: { add: 1, edit: 0, disable: 0, remove: 0 },
      tagRulesApplied: 0,
      transactionsImported: 5,
      transactionsFailed: 0,
      failedDetails: [],
      retroactiveReclassifications: 3,
    };
    mockCommitImport.mockResolvedValue({
      data: { data: resultData, message: 'done' },
      error: undefined,
    });
    render(renderStep());
    clickCommitAndConfirm();

    await waitFor(() => {
      expect(mockSetCommitResult).toHaveBeenCalledWith(resultData);
      expect(mockNextStep).toHaveBeenCalledOnce();
    });
    expect(mockSetDraftId).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('shows error message on commit failure', async () => {
    mockCommitImport.mockResolvedValue({
      data: undefined,
      error: { message: 'Database constraint violated' },
      response: { status: 409 } as Response,
    });
    render(renderStep());
    clickCommitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('Commit failed')).toBeDefined();
      expect(screen.getByText('Database constraint violated')).toBeDefined();
    });
  });

  it('does not advance to Summary when the commit fails', async () => {
    mockCommitImport.mockResolvedValue({
      data: undefined,
      error: { message: 'boom' },
      response: { status: 500 } as Response,
    });
    render(renderStep());
    clickCommitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('Commit failed')).toBeDefined();
    });
    expect(mockNextStep).not.toHaveBeenCalled();
    expect(mockSetDraftId).not.toHaveBeenCalled();
  });

  it('disables Back button during commit', async () => {
    let resolveCommit: (v: unknown) => void = () => undefined;
    mockCommitImport.mockReturnValue(
      new Promise((resolve) => {
        resolveCommit = resolve;
      })
    );
    render(renderStep());
    clickCommitAndConfirm();
    await waitFor(() => expect(screen.getByText('Back').closest('button')?.disabled).toBe(true));
    resolveCommit({ data: { data: {}, message: 'ok' }, error: undefined });
  });

  it('calls prevStep on Back click', () => {
    render(renderStep());
    fireEvent.click(screen.getByText('Back'));
    expect(mockPrevStep).toHaveBeenCalledOnce();
  });
});
