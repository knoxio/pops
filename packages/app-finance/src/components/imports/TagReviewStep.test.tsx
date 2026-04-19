import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@pops/api-client', () => ({
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
  const ButtonStub = ({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler;
    disabled?: boolean;
    'aria-label'?: string;
  }) => React.createElement('button', { onClick, disabled, 'aria-label': ariaLabel }, children);
  return {
    Button: ButtonStub,
    ButtonPrimitive: ButtonStub,
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
// Mock TagRuleProposalDialog — captures onApplied for handleTagRuleApplied tests
// ---------------------------------------------------------------------------

// eslint-disable-next-line prefer-const
let mockOnAppliedFn: ((...args: unknown[]) => void) | null = null;

/** Captures the last signal and previewTransactions passed to TagRuleProposalDialog. */
const mockDialogCapture = {
  signal: null as unknown,
  previewTransactions: null as unknown[] | null,
};

vi.mock('./TagRuleProposalDialog', async () => {
  const React = await import('react');
  return {
    TagRuleProposalDialog: ({
      onApplied,
      open,
      signal,
      previewTransactions,
    }: {
      onApplied?: (...args: unknown[]) => void;
      open: boolean;
      onOpenChange: (v: boolean) => void;
      signal: unknown;
      previewTransactions: unknown[];
    }) => {
      if (onApplied) {
        mockOnAppliedFn = onApplied;
      }
      mockDialogCapture.signal = signal;
      mockDialogCapture.previewTransactions = previewTransactions;
      if (!open) return null;
      return React.createElement('div', { 'data-testid': 'dialog' });
    },
  };
});

// ---------------------------------------------------------------------------
// Mock TagEditor — stub that exposes a trigger to simulate user edits
// ---------------------------------------------------------------------------

vi.mock('../TagEditor', async () => {
  const React = await import('react');
  return {
    TagEditor: ({
      onSave,
      currentTags,
    }: {
      onSave: (tags: string[]) => void;
      currentTags: string[];
    }) =>
      React.createElement(
        'button',
        {
          'data-testid': 'tag-editor-trigger-edit',
          onClick: () => onSave([...currentTags, 'EditedByUser']),
        },
        'Simulate Edit'
      ),
  };
});

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

import type { TagRuleChangeSet, TagRuleImpactItem } from '@pops/api/modules/core/tag-rules/types';
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
  mockOnAppliedFn = null;
  mockDialogCapture.signal = null;
  mockDialogCapture.previewTransactions = null;
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

  it('renders one "Save tag rule…" button per group and one "Save rule…" per transaction', () => {
    seedTransactions([woolworthsTx1, netflixTx, noTagTx]);
    renderTagReviewStep();

    // 3 group-level buttons + 3 transaction-level buttons = 6 total
    const saveButtons = screen.getAllByRole('button', { name: /Save tag rule/i });
    expect(saveButtons).toHaveLength(6);
    // Group-level buttons use the entity name
    expect(screen.getByLabelText('Save tag rule for Woolworths')).toBeInTheDocument();
    expect(screen.getByLabelText('Save tag rule for Netflix')).toBeInTheDocument();
    // Transaction-level buttons use the raw description
    expect(screen.getByLabelText('Save tag rule for WOOLWORTHS METRO')).toBeInTheDocument();
    expect(screen.getByLabelText('Save tag rule for NETFLIX.COM')).toBeInTheDocument();
  });

  it('opens TagRuleProposalDialog when "Save rule…" is clicked on a transaction row with tags', async () => {
    seedTransactions([woolworthsTx1]);
    renderTagReviewStep();

    const saveBtn = screen.getByLabelText('Save tag rule for WOOLWORTHS METRO');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
  });

  it('shows a toast and does not open dialog when transaction row has no tags', async () => {
    seedTransactions([noTagTx]);
    renderTagReviewStep();

    const saveBtn = screen.getByLabelText('Save tag rule for UNKNOWN VENDOR');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockToastInfo).toHaveBeenCalledWith(expect.stringContaining('Add at least one tag'));
    });
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('passes correct signal (description, matchType, entityId, tags) for transaction-scope dialog', async () => {
    seedTransactions([woolworthsTx1]);
    renderTagReviewStep();

    const saveBtn = screen.getByLabelText('Save tag rule for WOOLWORTHS METRO');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });

    expect(mockDialogCapture.signal).toMatchObject({
      descriptionPattern: 'WOOLWORTHS METRO',
      matchType: 'contains',
      entityId: 'woolworths-id',
      tags: expect.arrayContaining(['Groceries']),
    });
  });

  it('passes full previewTransactions list (not only the clicked row) to dialog', async () => {
    seedTransactions([woolworthsTx1, netflixTx]);
    renderTagReviewStep();

    const saveBtn = screen.getByLabelText('Save tag rule for WOOLWORTHS METRO');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });

    expect(mockDialogCapture.previewTransactions).toHaveLength(2);
    expect(mockDialogCapture.previewTransactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: 'WOOLWORTHS METRO' }),
        expect.objectContaining({ description: 'NETFLIX.COM' }),
      ])
    );
  });

  it('approving from transaction-scope dialog propagates tags via handleTagRuleApplied', () => {
    const CHECKSUM = woolworthsTx1.checksum;
    seedTransactions([woolworthsTx1]);
    renderTagReviewStep();

    const saveBtn = screen.getByLabelText('Save tag rule for WOOLWORTHS METRO');
    fireEvent.click(saveBtn);

    act(() => {
      mockOnAppliedFn!(
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'WOOLWORTHS METRO',
                matchType: 'contains',
                tags: ['Groceries', 'Food'],
              },
            },
          ],
        },
        [
          {
            transactionId: CHECKSUM,
            description: 'WOOLWORTHS METRO',
            before: { suggestedTags: [] },
            after: {
              suggestedTags: [
                { tag: 'Groceries', source: 'tag_rule' as const },
                { tag: 'Food', source: 'tag_rule' as const },
              ],
            },
          },
        ]
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /Continue to final review/i }));
    expect(mockUpdateTransactionTags).toHaveBeenCalledWith(
      CHECKSUM,
      expect.arrayContaining(['Groceries', 'Food'])
    );
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

describe('TagReviewStep — handleTagRuleApplied live re-suggestion (PRD-029 US-03)', () => {
  const CHECKSUM_A = 'test-checksum-aaa';
  const CHECKSUM_B = 'test-checksum-bbb';

  const txA = makeTransaction({
    description: 'SUPERMARKET TX',
    amount: -45.0,
    entityName: 'Supermarket',
    entityId: 'super-id',
    checksum: CHECKSUM_A,
    tags: ['Groceries'],
    suggestedTags: [{ tag: 'Groceries', source: 'ai' }],
  });

  const txB = makeTransaction({
    description: 'PHARMACY TX',
    amount: -20.0,
    entityName: 'Pharmacy',
    entityId: 'pharma-id',
    checksum: CHECKSUM_B,
    tags: ['Health'],
    suggestedTags: [{ tag: 'Health', source: 'entity' }],
  });

  function makeChangeSet(): TagRuleChangeSet {
    return {
      ops: [
        {
          op: 'add',
          data: { descriptionPattern: 'test', matchType: 'contains', tags: ['NewTag'] },
        },
      ],
    };
  }

  function makeAffected(checksum: string, tags: string[]): TagRuleImpactItem[] {
    return [
      {
        transactionId: checksum,
        description: 'SUPERMARKET TX',
        before: { suggestedTags: [] },
        after: { suggestedTags: tags.map((tag) => ({ tag, source: 'tag_rule' as const })) },
      },
    ];
  }

  it('merges rule-suggested tags into non-edited transaction tags', () => {
    seedTransactions([txA]);
    renderTagReviewStep();

    act(() => {
      mockOnAppliedFn!(makeChangeSet(), makeAffected(CHECKSUM_A, ['Transport']));
    });

    fireEvent.click(screen.getByRole('button', { name: /Continue to final review/i }));
    expect(mockUpdateTransactionTags).toHaveBeenCalledWith(
      CHECKSUM_A,
      expect.arrayContaining(['Groceries', 'Transport'])
    );
  });

  it('does not replace existing tags — only adds missing ones', () => {
    seedTransactions([txA]);
    renderTagReviewStep();

    // Rule suggests both an existing tag and a new tag
    act(() => {
      mockOnAppliedFn!(makeChangeSet(), makeAffected(CHECKSUM_A, ['Groceries', 'Food']));
    });

    fireEvent.click(screen.getByRole('button', { name: /Continue to final review/i }));
    const call = mockUpdateTransactionTags.mock.calls.find(([cs]) => cs === CHECKSUM_A);
    const tags = call?.[1] as string[] | undefined;
    expect(tags).toEqual(expect.arrayContaining(['Groceries', 'Food']));
    // Groceries should not be duplicated (Set dedup)
    expect(tags?.filter((t) => t === 'Groceries')).toHaveLength(1);
  });

  it('skips transactions that the user has manually edited', () => {
    seedTransactions([txA]);
    renderTagReviewStep();

    // Simulate user editing the transaction (adds 'EditedByUser', marks checksum as edited)
    fireEvent.click(screen.getByTestId('tag-editor-trigger-edit'));

    act(() => {
      mockOnAppliedFn!(makeChangeSet(), makeAffected(CHECKSUM_A, ['Transport']));
    });

    fireEvent.click(screen.getByRole('button', { name: /Continue to final review/i }));
    const call = mockUpdateTransactionTags.mock.calls.find(([cs]) => cs === CHECKSUM_A);
    expect(call?.[1]).not.toContain('Transport');
    expect(call?.[1]).toContain('EditedByUser');
  });

  it('only updates matching transactions, not unrelated ones', () => {
    seedTransactions([txA, txB]);
    renderTagReviewStep();

    act(() => {
      mockOnAppliedFn!(makeChangeSet(), makeAffected(CHECKSUM_A, ['Transport']));
    });

    fireEvent.click(screen.getByRole('button', { name: /Continue to final review/i }));

    const callA = mockUpdateTransactionTags.mock.calls.find(([cs]) => cs === CHECKSUM_A);
    const callB = mockUpdateTransactionTags.mock.calls.find(([cs]) => cs === CHECKSUM_B);
    expect(callA?.[1]).toContain('Transport');
    expect(callB?.[1]).not.toContain('Transport');
  });

  it('calls addPendingTagRuleChangeSet with the change set and source', () => {
    seedTransactions([txA]);
    renderTagReviewStep();

    const changeSet = makeChangeSet();
    act(() => {
      mockOnAppliedFn!(changeSet, []);
    });

    expect(mockAddPendingTagRuleChangeSet).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSet,
        source: expect.stringContaining('tag-review:'),
      })
    );
  });

  it('handles empty affected list without mutating any tags', () => {
    seedTransactions([txA]);
    renderTagReviewStep();

    act(() => {
      mockOnAppliedFn!(makeChangeSet(), []);
    });

    fireEvent.click(screen.getByRole('button', { name: /Continue to final review/i }));
    expect(mockUpdateTransactionTags).toHaveBeenCalledWith(CHECKSUM_A, ['Groceries']);
  });
});
