import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Store mock state ---

const mockPrevStep = vi.fn();
const mockNextStep = vi.fn();
const mockSetCommitResult = vi.fn();

let storeState: Record<string, unknown> = {};

vi.mock('../../store/importStore', () => ({
  useImportStore: (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState,
}));

// --- tRPC mock ---

const mockMutate = vi.fn();
let mutationCallbacks: {
  onSuccess?: (data: unknown) => void;
  onError?: (err: unknown) => void;
} = {};
let mockIsPending = false;

vi.mock('../../lib/trpc', () => ({
  trpc: {
    finance: {
      imports: {
        commitImport: {
          useMutation: (opts: typeof mutationCallbacks) => {
            mutationCallbacks = opts;
            return {
              mutate: mockMutate,
              isPending: mockIsPending,
            };
          },
        },
      },
    },
  },
}));

vi.mock('../../lib/commit-payload', () => ({
  buildCommitPayload: vi.fn(
    (entities: unknown[], changeSets: unknown[], transactions: unknown[]) => ({
      entities,
      changeSets: (changeSets as Array<{ changeSet: unknown }>).map((pcs) => pcs.changeSet),
      transactions,
    })
  ),
}));

import { FinalReviewStep } from './FinalReviewStep';

// --- Helpers ---

function makeStoreState(overrides: Partial<typeof storeState> = {}) {
  return {
    pendingEntities: [],
    pendingChangeSets: [],
    confirmedTransactions: [],
    processedTransactions: {
      matched: [],
      uncertain: [],
      failed: [],
      skipped: [],
    },
    commitResult: null,
    prevStep: mockPrevStep,
    nextStep: mockNextStep,
    setCommitResult: mockSetCommitResult,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeState = makeStoreState();
  mockIsPending = false;
});

// --- Tests ---

describe('FinalReviewStep', () => {
  it('renders empty state when no pending changes', () => {
    render(<FinalReviewStep />);
    expect(screen.getByText('No pending changes to review.')).toBeDefined();
  });

  it('hides sections with zero items', () => {
    render(<FinalReviewStep />);
    expect(screen.queryByText('New Entities')).toBeNull();
    expect(screen.queryByText('Rule Changes')).toBeNull();
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
    render(<FinalReviewStep />);
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
    render(<FinalReviewStep />);
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
    render(<FinalReviewStep />);
    expect(screen.getByText('Matched:')).toBeDefined();
    expect(screen.getByText('Corrected:')).toBeDefined();
    expect(screen.getByText('Manual:')).toBeDefined();
    // Should NOT show internal bucket names
    expect(screen.queryByText('Uncertain:')).toBeNull();
    expect(screen.queryByText('Failed:')).toBeNull();
  });

  it('shows tag assignment count', () => {
    storeState = makeStoreState({
      confirmedTransactions: [
        { id: 't1', tags: ['food', 'groceries'] },
        { id: 't2', tags: ['transport'] },
        { id: 't3' },
      ],
    });
    render(<FinalReviewStep />);
    expect(screen.getByText(/3 tags will be applied across 2 transactions/)).toBeDefined();
  });

  it('defaults sections to collapsed when count > 10', () => {
    const manyEntities = Array.from({ length: 12 }, (_, i) => ({
      tempId: `temp:entity:${i}`,
      name: `Entity ${i}`,
      type: 'company',
    }));
    storeState = makeStoreState({ pendingEntities: manyEntities });
    render(<FinalReviewStep />);
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
    render(<FinalReviewStep />);
    // Click section header to expand
    fireEvent.click(screen.getByText('New Entities').closest('button')!);
    expect(screen.getByText('Entity 0')).toBeDefined();
  });

  it("shows 'Approve & Commit All' button instead of 'Continue to Import'", () => {
    render(<FinalReviewStep />);
    expect(screen.getByText('Approve & Commit All')).toBeDefined();
    expect(screen.queryByText('Continue to Import')).toBeNull();
  });

  it('calls commitImport mutation on Approve & Commit All click', () => {
    storeState = makeStoreState({
      confirmedTransactions: [{ id: 't1', checksum: 'abc' }],
    });
    render(<FinalReviewStep />);
    fireEvent.click(screen.getByText('Approve & Commit All'));
    expect(mockMutate).toHaveBeenCalledOnce();
  });

  it('stores commitResult and shows Continue on success', async () => {
    render(<FinalReviewStep />);
    fireEvent.click(screen.getByText('Approve & Commit All'));

    // Simulate successful mutation
    mutationCallbacks.onSuccess?.({
      data: {
        entitiesCreated: 2,
        rulesApplied: { add: 1, edit: 0, disable: 0, remove: 0 },
        transactionsImported: 5,
        transactionsFailed: 0,
        failedDetails: [],
        retroactiveReclassifications: 3,
      },
    });

    await waitFor(() => {
      expect(mockSetCommitResult).toHaveBeenCalledWith({
        entitiesCreated: 2,
        rulesApplied: { add: 1, edit: 0, disable: 0, remove: 0 },
        transactionsImported: 5,
        transactionsFailed: 0,
        failedDetails: [],
        retroactiveReclassifications: 3,
      });
      expect(screen.getByText('Continue')).toBeDefined();
    });
  });

  it('shows inline result summary after successful commit (US-05 AC-4)', async () => {
    const resultData = {
      entitiesCreated: 2,
      rulesApplied: { add: 1, edit: 0, disable: 0, remove: 0 },
      transactionsImported: 5,
      transactionsFailed: 0,
      failedDetails: [],
      retroactiveReclassifications: 3,
    };
    storeState = makeStoreState({ commitResult: resultData });
    render(<FinalReviewStep />);
    fireEvent.click(screen.getByText('Approve & Commit All'));

    mutationCallbacks.onSuccess?.({ data: resultData });

    await waitFor(() => {
      expect(screen.getByText('Commit Successful')).toBeDefined();
      expect(screen.getByText('Entities created:')).toBeDefined();
      expect(screen.getByText('Transactions imported:')).toBeDefined();
      expect(screen.getByText('Rules applied:')).toBeDefined();
      expect(screen.getByText('Reclassifications:')).toBeDefined();
    });
  });

  it('hides Back button after successful commit', async () => {
    render(<FinalReviewStep />);
    expect(screen.getByText('Back')).toBeDefined();

    mutationCallbacks.onSuccess?.({ data: {} });

    await waitFor(() => {
      expect(screen.queryByText('Back')).toBeNull();
    });
  });

  it('shows error message on commit failure', async () => {
    render(<FinalReviewStep />);
    fireEvent.click(screen.getByText('Approve & Commit All'));

    mutationCallbacks.onError?.({ message: 'Database constraint violated' });

    await waitFor(() => {
      expect(screen.getByText('Commit failed')).toBeDefined();
      expect(screen.getByText('Database constraint violated')).toBeDefined();
    });
  });

  it('disables Back button during commit', () => {
    mockIsPending = true;
    render(<FinalReviewStep />);
    const backButton = screen.getByText('Back');
    expect(backButton.closest('button')?.disabled).toBe(true);
  });

  it('Continue button calls nextStep', async () => {
    render(<FinalReviewStep />);
    mutationCallbacks.onSuccess?.({ data: {} });

    await waitFor(() => {
      fireEvent.click(screen.getByText('Continue'));
      expect(mockNextStep).toHaveBeenCalledOnce();
    });
  });

  it('calls prevStep on Back click', () => {
    render(<FinalReviewStep />);
    fireEvent.click(screen.getByText('Back'));
    expect(mockPrevStep).toHaveBeenCalledOnce();
  });
});
