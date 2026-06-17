import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TagRuleProposalDialog } from './TagRuleProposalDialog';

// ---------------------------------------------------------------------------
// Hoisted finance SDK mocks (referenced inside vi.mock factories)
// ---------------------------------------------------------------------------

const { mockPropose, mockApply, mockReject } = vi.hoisted(() => ({
  mockPropose: vi.fn(),
  mockApply: vi.fn(),
  mockReject: vi.fn(),
}));

type ProposeData = {
  changeSet: { source?: string; reason?: string; ops: Array<Record<string, unknown>> };
  rationale: string;
  preview: {
    counts: { affected: number; suggestionChanges: number; newTagProposals: number };
    affected: unknown[];
  };
} | null;

vi.mock('../../finance-api/index.js', () => ({
  tagRulesPropose: (...args: unknown[]) => mockPropose(...args),
  tagRulesApply: (...args: unknown[]) => mockApply(...args),
  tagRulesReject: (...args: unknown[]) => mockReject(...args),
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

function withClient(node: ReactElement): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>;
}

function renderDialog(onOpenChange = vi.fn(), onApplied = vi.fn()) {
  return render(
    withClient(
      <TagRuleProposalDialog
        open={true}
        onOpenChange={onOpenChange}
        signal={signal}
        previewTransactions={[{ checksum: 't1', description: 'WOOLWORTHS 1234', entityId: null }]}
        onApplied={onApplied}
      />
    )
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TagRuleProposalDialog', () => {
  beforeEach(() => {
    mockPropose.mockReset();
    mockApply.mockReset();
    mockReject.mockReset();
    mockPropose.mockResolvedValue({ data: baseProposal, error: undefined });
    mockApply.mockResolvedValue({ data: { rules: [] }, error: undefined });
    mockReject.mockResolvedValue({
      data: { message: 'Tag rule ChangeSet rejected', followUpProposal: null },
      error: undefined,
    });
  });

  it('issues the propose query and renders the proposal rationale', async () => {
    renderDialog();
    expect(await screen.findByText(/contains:WOOLWORTHS/i)).toBeDefined();
    expect(mockPropose).toHaveBeenCalledWith({
      body: expect.objectContaining({
        signal: expect.objectContaining({ descriptionPattern: 'WOOLWORTHS', tags: ['Groceries'] }),
      }),
    });
  });

  it('shows the reject feedback textarea after clicking "Reject…"', async () => {
    renderDialog();
    await screen.findByText(/contains:WOOLWORTHS/i);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/feedback/i)).toBeDefined();
    });
  });

  it('calls tagRulesReject with the changeSet, feedback, and signal on confirm', async () => {
    renderDialog();
    await screen.findByText(/contains:WOOLWORTHS/i);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    const textarea = await screen.findByLabelText(/feedback/i);
    fireEvent.change(textarea, { target: { value: 'Too broad' } });

    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    await waitFor(() => expect(mockReject).toHaveBeenCalledOnce());
    const callArg = mockReject.mock.calls[0][0] as { body: Record<string, unknown> };
    expect(callArg.body.feedback).toBe('Too broad');
    expect(callArg.body.signal).toBeDefined();
    expect(callArg.body.transactions).toBeDefined();
  });

  it('closes the dialog when rejection returns no followUpProposal', async () => {
    const onOpenChange = vi.fn();
    mockReject.mockResolvedValue({
      data: { message: 'Tag rule ChangeSet rejected', followUpProposal: null },
      error: undefined,
    });
    renderDialog(onOpenChange);
    await screen.findByText(/contains:WOOLWORTHS/i);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    const textarea = await screen.findByLabelText(/feedback/i);
    fireEvent.change(textarea, { target: { value: 'Dismiss it' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('shows revised proposal banner when rejection returns a followUpProposal', async () => {
    const onOpenChange = vi.fn();
    const followUpProposal: ProposeData = {
      ...baseProposal,
      rationale:
        'Add new tag rule (exact:WOOLWORTHS) from tag edit signal — revised after rejection: "Use exact match"',
      changeSet: {
        ...baseProposal.changeSet,
        reason: 'Revised tag rule incorporating rejection feedback: Use exact match',
      },
    };
    mockReject.mockResolvedValue({
      data: { message: 'Tag rule ChangeSet rejected', followUpProposal },
      error: undefined,
    });
    renderDialog(onOpenChange);
    await screen.findByText(/contains:WOOLWORTHS/i);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    const textarea = await screen.findByLabelText(/feedback/i);
    fireEvent.change(textarea, { target: { value: 'Use exact match' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    await waitFor(() => {
      // The revised-proposal banner must appear.
      expect(screen.getByText(/revised proposal based on your feedback/i)).toBeDefined();
    });
    // The dialog must NOT close.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('does not close the dialog when a follow-up proposal is shown', async () => {
    const onOpenChange = vi.fn();
    mockReject.mockResolvedValue({
      data: { message: 'Tag rule ChangeSet rejected', followUpProposal: baseProposal },
      error: undefined,
    });
    renderDialog(onOpenChange);
    await screen.findByText(/contains:WOOLWORTHS/i);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    const textarea = await screen.findByLabelText(/feedback/i);
    fireEvent.change(textarea, { target: { value: 'Some feedback' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }));

    await waitFor(() =>
      expect(screen.getByText(/revised proposal based on your feedback/i)).toBeDefined()
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
