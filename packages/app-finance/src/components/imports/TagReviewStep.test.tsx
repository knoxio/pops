import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock imports store
// ---------------------------------------------------------------------------

const mockAddPendingTagRuleChangeSet = vi.fn();
const mockUpdateTransactionTags = vi.fn();
const mockNextStep = vi.fn();
const mockPrevStep = vi.fn();

const mockConfirmedTransactions: unknown[] = [];

const mockStoreState = {
  get confirmedTransactions() {
    return mockConfirmedTransactions;
  },
  updateTransactionTags: mockUpdateTransactionTags,
  nextStep: mockNextStep,
  prevStep: mockPrevStep,
  addPendingTagRuleChangeSet: mockAddPendingTagRuleChangeSet,
};

vi.mock('../../store/importStore', () => ({
  useImportStore: (selector?: (s: typeof mockStoreState) => unknown) => {
    if (typeof selector === 'function') return selector(mockStoreState);
    return mockStoreState;
  },
}));

// ---------------------------------------------------------------------------
// Mock trpc
// ---------------------------------------------------------------------------

vi.mock('../../lib/trpc', () => ({
  trpc: {
    finance: {
      transactions: {
        availableTags: {
          useQuery: () => ({ data: ['Groceries', 'Transport', 'Subscriptions'] }),
        },
      },
    },
    core: {
      tagRules: {
        proposeTagRuleChangeSet: {
          useQuery: () => ({
            data: null,
            isLoading: false,
            isError: false,
            error: null,
          }),
        },
        applyTagRuleChangeSet: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        rejectTagRuleChangeSet: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        listVocabulary: {
          invalidate: vi.fn(),
        },
      },
    },
    useUtils: () => ({
      core: {
        tagRules: {
          listVocabulary: {
            invalidate: vi.fn(),
          },
        },
      },
    }),
  },
}));

// ---------------------------------------------------------------------------
// Mock sonner toast
// ---------------------------------------------------------------------------

const mockToastInfo = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: vi.fn(),
    info: (...args: unknown[]) => mockToastInfo(...args),
    message: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock @pops/ui — minimal stubs
// ---------------------------------------------------------------------------

vi.mock('@pops/ui', async () => {
  const React = await import('react');
  return {
    Button: ({
      children,
      onClick,
      disabled,
      'aria-label': ariaLabel,
    }: {
      children: React.ReactNode;
      onClick?: React.MouseEventHandler;
      disabled?: boolean;
      'aria-label'?: string;
    }) => React.createElement('button', { onClick, disabled, 'aria-label': ariaLabel }, children),
    Badge: ({ children }: { children: React.ReactNode }) =>
      React.createElement('span', { 'data-testid': 'badge' }, children),
    Dialog: ({
      open,
      children,
    }: {
      open: boolean;
      onOpenChange: (v: boolean) => void;
      children: React.ReactNode;
    }) => (open ? React.createElement('div', { 'data-testid': 'dialog' }, children) : null),
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', null, children),
    DialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement('input', props),
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) =>
      React.createElement('label', { htmlFor }, children),
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement('textarea', props),
    Checkbox: ({
      checked,
      onCheckedChange,
    }: {
      checked?: boolean;
      onCheckedChange?: (v: boolean) => void;
    }) =>
      React.createElement('input', {
        type: 'checkbox',
        checked,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onCheckedChange?.(e.target.checked),
      }),
  };
});

// ---------------------------------------------------------------------------
// Mock TagEditor — stub to avoid complex sub-component rendering
// ---------------------------------------------------------------------------

vi.mock('../TagEditor', () => ({
  TagEditor: () => null,
}));

// ---------------------------------------------------------------------------
// Mock lib/utils — cn is used by GroupTagBar
// ---------------------------------------------------------------------------

vi.mock('../../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// ---------------------------------------------------------------------------
// Import the component under test (MUST come after mocks)
// ---------------------------------------------------------------------------

import { TagReviewStep } from './TagReviewStep';

import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTransaction(
  overrides: Partial<ConfirmedTransaction> & { description: string; amount: number }
): ConfirmedTransaction {
  return {
    date: '2026-03-01',
    account: 'Amex',
    rawRow: '{}',
    checksum: Math.random().toString(36).slice(2),
    tags: [],
    suggestedTags: [],
    ...overrides,
  };
}

const woolworthsTx1 = makeTransaction({
  description: 'WOOLWORTHS METRO',
  amount: -87.45,
  entityName: 'Woolworths',
  entityId: 'woolworths-id',
  tags: ['Groceries'],
  suggestedTags: [{ tag: 'Groceries', source: 'entity' }],
});

const woolworthsTx2 = makeTransaction({
  description: 'WOOLWORTHS ONLINE',
  amount: -55.0,
  entityName: 'Woolworths',
  entityId: 'woolworths-id',
  tags: ['Groceries'],
  suggestedTags: [{ tag: 'Groceries', source: 'rule', pattern: 'woolworths' }],
});

const netflixTx = makeTransaction({
  description: 'NETFLIX.COM',
  amount: -22.99,
  entityName: 'Netflix',
  entityId: 'netflix-id',
  tags: ['Subscriptions'],
  suggestedTags: [{ tag: 'Subscriptions', source: 'ai' }],
});

const noTagTx = makeTransaction({
  description: 'UNKNOWN VENDOR',
  amount: -10.0,
  entityName: 'Unknown',
  tags: [],
  suggestedTags: [],
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedTransactions(txns: ConfirmedTransaction[]) {
  mockConfirmedTransactions.length = 0;
  mockConfirmedTransactions.push(...txns);
}

function renderTagReviewStep() {
  return render(<TagReviewStep />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockConfirmedTransactions.length = 0;
  mockAddPendingTagRuleChangeSet.mockReset();
  mockUpdateTransactionTags.mockReset();
  mockNextStep.mockReset();
  mockPrevStep.mockReset();
  mockToastInfo.mockReset();
  mockToastSuccess.mockReset();
});

describe('TagReviewStep — Save tag rule wiring (PRD-029 US-02 / US-03)', () => {
  it('renders a "Save tag rule…" button for each entity group', () => {
    seedTransactions([woolworthsTx1, netflixTx]);
    renderTagReviewStep();

    expect(screen.getByLabelText('Save tag rule for Woolworths')).toBeInTheDocument();
    expect(screen.getByLabelText('Save tag rule for Netflix')).toBeInTheDocument();
  });

  it('opens TagRuleProposalDialog when "Save tag rule…" is clicked on a group with tags', async () => {
    seedTransactions([woolworthsTx1, woolworthsTx2]);
    renderTagReviewStep();

    const saveBtn = screen.getByLabelText('Save tag rule for Woolworths');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
  });

  it('shows a toast and does not open dialog when group has no tags', async () => {
    seedTransactions([noTagTx]);
    renderTagReviewStep();

    const saveBtn = screen.getByLabelText('Save tag rule for Unknown');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('Add at least one tag'));
    });
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders one "Save tag rule…" button per group even with multiple groups', () => {
    seedTransactions([woolworthsTx1, netflixTx, noTagTx]);
    renderTagReviewStep();

    // Three entity groups: Woolworths, Netflix, Unknown
    const saveButtons = screen.getAllByRole('button', { name: /Save tag rule/i });
    expect(saveButtons).toHaveLength(3);
  });

  it('shows empty state when there are no confirmed transactions', () => {
    seedTransactions([]);
    renderTagReviewStep();

    expect(screen.getByText(/No transactions to import/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save tag rule/i })).not.toBeInTheDocument();
  });
});

describe('TagReviewStep — Continue and navigation', () => {
  it('calls updateTransactionTags and nextStep on Continue', () => {
    seedTransactions([woolworthsTx1]);
    renderTagReviewStep();

    fireEvent.click(screen.getByRole('button', { name: /Continue to final review/i }));
    expect(mockUpdateTransactionTags).toHaveBeenCalled();
    expect(mockNextStep).toHaveBeenCalled();
  });

  it('Continue button is disabled when there are no transactions', () => {
    seedTransactions([]);
    renderTagReviewStep();

    const continueBtn = screen.getByRole('button', { name: /Continue to final review/i });
    expect(continueBtn).toBeDisabled();
  });

  it('calls prevStep when Back is clicked', () => {
    seedTransactions([woolworthsTx1]);
    renderTagReviewStep();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(mockPrevStep).toHaveBeenCalled();
  });
});

describe('TagReviewStep — Accept All Suggestions', () => {
  it('renders Accept All Suggestions button when transactions exist', () => {
    seedTransactions([woolworthsTx1]);
    renderTagReviewStep();
    expect(screen.getByRole('button', { name: /Accept All Suggestions/i })).toBeInTheDocument();
  });

  it('does not render Accept All Suggestions when no transactions', () => {
    seedTransactions([]);
    renderTagReviewStep();
    expect(
      screen.queryByRole('button', { name: /Accept All Suggestions/i })
    ).not.toBeInTheDocument();
  });
});
