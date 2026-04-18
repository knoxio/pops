import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TagRuleProposalDialog } from './TagRuleProposalDialog';

// ---------------------------------------------------------------------------
// Hoisted mocks (referenced inside vi.mock factories)
// ---------------------------------------------------------------------------

const { mockRejectMutate, mockApplyMutateAsync, mockInvalidate } = vi.hoisted(() => ({
  mockRejectMutate: vi.fn(),
  mockApplyMutateAsync: vi.fn(),
  mockInvalidate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock trpc
// ---------------------------------------------------------------------------

type ProposeData = {
  changeSet: { source?: string; reason?: string; ops: Array<Record<string, unknown>> };
  rationale: string;
  preview: {
    counts: { affected: number; suggestionChanges: number; newTagProposals: number };
    affected: unknown[];
  };
} | null;

let mockProposeData: ProposeData = null;
let mockRejectOnSuccess:
  | ((data: { message: string; followUpProposal: ProposeData }) => void)
  | undefined;
let _mockRejectOnError: ((err: Error) => void) | undefined;

vi.mock('../../lib/trpc', () => ({
  trpc: {
    core: {
      tagRules: {
        proposeTagRuleChangeSet: {
          useQuery: () => ({
            data: mockProposeData,
            isLoading: false,
            isError: false,
            error: null,
          }),
        },
        applyTagRuleChangeSet: {
          useMutation: () => ({
            mutateAsync: mockApplyMutateAsync,
            isPending: false,
          }),
        },
        rejectTagRuleChangeSet: {
          useMutation: (opts: {
            onSuccess?: (data: { message: string; followUpProposal: ProposeData }) => void;
            onError?: (err: Error) => void;
          }) => {
            mockRejectOnSuccess = opts.onSuccess;
            _mockRejectOnError = opts.onError;
            return {
              mutate: (...args: unknown[]) => {
                mockRejectMutate(...args);
              },
              isPending: false,
            };
          },
        },
        listVocabulary: {
          invalidate: mockInvalidate,
        },
      },
    },
    useUtils: () => ({
      core: {
        tagRules: {
          listVocabulary: {
            invalidate: mockInvalidate,
          },
        },
      },
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const signal = {
  descriptionPattern: 'WOOLWORTHS',
  matchType: 'contains' as const,
  entityId: null,
  tags: ['Groceries'],
};

const baseProposal: ProposeData = {
  changeSet: {
    source: 'tag-edit-signal',
    reason: 'Create new tag rule from tag edit signal',
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: 'WOOLWORTHS',
          matchType: 'contains',
          entityId: null,
          tags: ['Groceries'],
          confidence: 0.95,
          isActive: true,
        },
      },
    ],
  },
  rationale: 'Add new tag rule (contains:WOOLWORTHS) from tag edit signal',
  preview: {
    counts: { affected: 1, suggestionChanges: 1, newTagProposals: 0 },
    affected: [
      {
        transactionId: 't1',
        description: 'WOOLWORTHS 1234',
        before: { suggestedTags: [] },
        after: { suggestedTags: [{ tag: 'Groceries', source: 'tag_rule', isNew: false }] },
      },
    ],
  },
};

function renderDialog(onOpenChange = vi.fn(), onApplied = vi.fn()) {
  return render(
    <TagRuleProposalDialog
      open={true}
      onOpenChange={onOpenChange}
      signal={signal}
      previewTransactions={[{ checksum: 't1', description: 'WOOLWORTHS 1234', entityId: null }]}
      onApplied={onApplied}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TagRuleProposalDialog', () => {
  beforeEach(() => {
    mockProposeData = baseProposal;
    mockRejectOnSuccess = undefined;
    _mockRejectOnError = undefined;
    mockRejectMutate.mockReset();
    mockApplyMutateAsync.mockReset();
    mockInvalidate.mockReset();
  });

  it('renders the proposal rationale', () => {
    renderDialog();
    expect(screen.getByText(/contains:WOOLWORTHS/i)).toBeDefined();
  });

  it('shows the reject feedback textarea after clicking "Reject…"', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/feedback/i)).toBeDefined();
    });
  });

  it('calls rejectTagRuleChangeSet with the changeSet, feedback, and signal on confirm', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    const textarea = await screen.findByLabelText(/feedback/i);
    fireEvent.change(textarea, { target: { value: 'Too broad' } });

    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    expect(mockRejectMutate).toHaveBeenCalledOnce();
    const callArg = mockRejectMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.feedback).toBe('Too broad');
    expect(callArg.signal).toBeDefined();
    expect(callArg.transactions).toBeDefined();
  });

  it('closes the dialog when rejection returns no followUpProposal', async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    const textarea = await screen.findByLabelText(/feedback/i);
    fireEvent.change(textarea, { target: { value: 'Dismiss it' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    // Simulate the mutation succeeding with no follow-up.
    mockRejectOnSuccess?.({ message: 'Tag rule ChangeSet rejected', followUpProposal: null });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('shows revised proposal banner when rejection returns a followUpProposal', async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    const textarea = await screen.findByLabelText(/feedback/i);
    fireEvent.change(textarea, { target: { value: 'Use exact match' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    const followUpProposal: ProposeData = {
      ...baseProposal,
      rationale:
        'Add new tag rule (exact:WOOLWORTHS) from tag edit signal — revised after rejection: "Use exact match"',
      changeSet: {
        ...baseProposal.changeSet,
        reason: 'Revised tag rule incorporating rejection feedback: Use exact match',
      },
    };

    // Simulate the mutation succeeding with a follow-up.
    mockRejectOnSuccess?.({
      message: 'Tag rule ChangeSet rejected',
      followUpProposal,
    });

    await waitFor(() => {
      // The dialog must NOT close.
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      // The revised-proposal banner must appear.
      expect(screen.getByText(/revised proposal based on your feedback/i)).toBeDefined();
    });
  });

  it('does not close the dialog when a follow-up proposal is shown', async () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    const textarea = await screen.findByLabelText(/feedback/i);
    fireEvent.change(textarea, { target: { value: 'Some feedback' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    mockRejectOnSuccess?.({
      message: 'Tag rule ChangeSet rejected',
      followUpProposal: baseProposal,
    });

    await waitFor(() => {
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });
});
