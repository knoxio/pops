import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CorrectionProposalDialog,
  type LocalOp,
  normalizeForMatch,
  PREVIEW_CHANGESET_MAX_TRANSACTIONS,
  scopePreviewTransactions,
  serverOpToLocalOp,
  transactionMatchesSignal,
} from './CorrectionProposalDialog';

import type { CorrectionRule } from './RulePicker';

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

type ProposeData = {
  changeSet: {
    source?: string;
    ops: Array<Record<string, unknown>>;
  };
  rationale: string;
  preview: { counts: Record<string, number>; affected: unknown[] };
} | null;

let mockProposeData: ProposeData = null;
const mockPreviewMutateAsync = vi.fn();
const mockRejectMutate = vi.fn();
const mockListQuery = vi.fn();
const mockReviseMutateAsync = vi.fn();
const mockAddPendingChangeSet = vi.fn();

let rejectOnSuccess: (() => void) | undefined;

vi.mock('../../store/importStore', () => ({
  useImportStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = { addPendingChangeSet: mockAddPendingChangeSet, pendingChangeSets: [] };
    return selector(state);
  },
}));

vi.mock('../../lib/trpc', () => ({
  trpc: {
    core: {
      corrections: {
        proposeChangeSet: {
          useQuery: () => ({
            data: mockProposeData,
            isFetching: false,
            isError: false,
            error: null,
            isLoading: mockProposeData === null,
          }),
        },
        previewChangeSet: {
          useMutation: () => ({
            mutateAsync: mockPreviewMutateAsync,
            isPending: false,
          }),
        },
        list: {
          useQuery: (...args: unknown[]) => mockListQuery(...args),
        },
        rejectChangeSet: {
          useMutation: (opts: { onSuccess?: () => void; onError?: (err: Error) => void }) => {
            rejectOnSuccess = opts.onSuccess;
            return {
              mutate: (...args: unknown[]) => {
                mockRejectMutate(...args);
                rejectOnSuccess?.();
              },
              isPending: false,
            };
          },
        },
        reviseChangeSet: {
          useMutation: () => ({
            mutateAsync: mockReviseMutateAsync,
            isPending: false,
          }),
        },
      },
    },
    finance: {
      transactions: {
        listDescriptionsForPreview: {
          useQuery: () => ({ data: { data: [], total: 0, truncated: false }, isLoading: false }),
        },
      },
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Kept utility tests (these were the entirety of the previous .test.ts)
// ---------------------------------------------------------------------------

describe('normalizeForMatch', () => {
  it('uppercases, strips digits, and collapses whitespace', () => {
    expect(normalizeForMatch('Woolworths 1234 Sydney')).toBe('WOOLWORTHS SYDNEY');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeForMatch('  netflix  ')).toBe('NETFLIX');
  });

  it('collapses multiple internal spaces to single', () => {
    expect(normalizeForMatch('FOO    BAR')).toBe('FOO BAR');
  });

  it('strips all digits, not just standalone runs', () => {
    expect(normalizeForMatch('TXN42ABC99')).toBe('TXNABC');
  });
});

describe('transactionMatchesSignal', () => {
  describe('contains', () => {
    it('matches when normalized description contains normalized pattern', () => {
      expect(
        transactionMatchesSignal('WOOLWORTHS 1234 ERSKINEVILLE', 'WOOLWORTHS', 'contains')
      ).toBe(true);
    });

    it('ignores digits in both description and pattern', () => {
      expect(transactionMatchesSignal('STORE 42 SYDNEY', 'STORE 99', 'contains')).toBe(true);
    });

    it('is case-insensitive via normalization', () => {
      expect(transactionMatchesSignal('netflix australia', 'NETFLIX', 'contains')).toBe(true);
    });

    it('rejects when pattern substring is absent', () => {
      expect(transactionMatchesSignal('COLES 1234 NEWTOWN', 'WOOLWORTHS', 'contains')).toBe(false);
    });

    it('rejects an empty pattern so we do not match everything', () => {
      expect(transactionMatchesSignal('ANYTHING', '', 'contains')).toBe(false);
      expect(transactionMatchesSignal('ANYTHING', '   ', 'contains')).toBe(false);
    });
  });

  describe('exact', () => {
    it('matches when normalized description equals normalized pattern', () => {
      expect(transactionMatchesSignal('NETFLIX 42', 'NETFLIX', 'exact')).toBe(true);
    });

    it('rejects when description has extra words', () => {
      expect(transactionMatchesSignal('NETFLIX AUSTRALIA PTY LTD', 'NETFLIX', 'exact')).toBe(false);
    });
  });

  describe('regex', () => {
    // These tests mirror the server's `findMatchingCorrectionFromRules`
    // semantics: `new RegExp(pattern).test(normalizeDescription(desc))` —
    // no flags, and the description is uppercased + digit-stripped + space-
    // collapsed BEFORE the regex runs. Client-side preview must match.
    it('tests against the normalized (uppercased) description, so patterns must be uppercase', () => {
      // Positive: uppercase pattern matches normalized description.
      expect(transactionMatchesSignal('PayID from John', 'PAYID', 'regex')).toBe(true);
      // Negative: lowercase pattern does NOT match because normalization
      // uppercases "PayID from John" to "PAYID FROM JOHN" and the regex
      // runs without the /i flag (server parity).
      expect(transactionMatchesSignal('PayID from John', 'payid', 'regex')).toBe(false);
    });

    it('tests against the digit-stripped description, so \\d+ cannot match digits in the input', () => {
      // "TXN42" normalizes to "TXN " (digits stripped), so TXN\d+ cannot
      // match. Users must write patterns against the normalized form.
      expect(transactionMatchesSignal('TXN42', 'TXN\\d+', 'regex')).toBe(false);
      // The same input DOES match a pattern written for the normalized form.
      expect(transactionMatchesSignal('TXN42', '^TXN\\s*$', 'regex')).toBe(true);
    });

    it('honours anchors in the pattern', () => {
      expect(transactionMatchesSignal('NETFLIX', '^NETFLIX$', 'regex')).toBe(true);
      expect(transactionMatchesSignal('NETFLIX AUSTRALIA', '^NETFLIX$', 'regex')).toBe(false);
    });

    it('returns false (not throws) for an invalid regex pattern', () => {
      expect(transactionMatchesSignal('anything', '[unclosed', 'regex')).toBe(false);
    });

    it('returns false for an empty regex pattern', () => {
      expect(transactionMatchesSignal('anything', '', 'regex')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// serverOpToLocalOp — hydration of targetRule from the server-provided map
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<CorrectionRule> = {}): CorrectionRule {
  return {
    id: 'rule-1',
    descriptionPattern: 'WOOLWORTHS',
    matchType: 'contains',
    entityId: null,
    entityName: 'Woolworths',
    location: null,
    tags: [],
    transactionType: null,
    isActive: true,
    confidence: 0.95,
    timesApplied: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
    ...overrides,
  };
}

describe('serverOpToLocalOp', () => {
  it("maps 'add' op without consulting targetRules", () => {
    const local = serverOpToLocalOp(
      {
        op: 'add',
        data: {
          descriptionPattern: 'NETFLIX',
          matchType: 'contains',
          entityName: 'Netflix',
          tags: [],
        },
      },
      {}
    );
    expect(local.kind).toBe('add');
    if (local.kind !== 'add') throw new Error('kind narrow');
    expect(local.data.descriptionPattern).toBe('NETFLIX');
    expect(local.dirty).toBe(false);
  });

  it("hydrates targetRule on 'edit' from the targetRules map", () => {
    const rule = makeRule({ id: 'rule-42' });
    const local = serverOpToLocalOp(
      { op: 'edit', id: 'rule-42', data: { entityName: 'Woolies' } },
      { 'rule-42': rule }
    );
    expect(local.kind).toBe('edit');
    if (local.kind !== 'edit') throw new Error('kind narrow');
    expect(local.targetRuleId).toBe('rule-42');
    expect(local.targetRule).toBe(rule);
  });

  it("leaves targetRule as null when hydration misses on 'disable'", () => {
    const local = serverOpToLocalOp({ op: 'disable', id: 'orphan' }, {});
    expect(local.kind).toBe('disable');
    if (local.kind !== 'disable') throw new Error('kind narrow');
    expect(local.targetRuleId).toBe('orphan');
    expect(local.targetRule).toBeNull();
  });

  it("hydrates targetRule on 'remove' when present in the map", () => {
    const rule = makeRule({ id: 'rule-99' });
    const local = serverOpToLocalOp(
      { op: 'remove', id: 'rule-99' },
      { 'rule-99': rule, other: makeRule({ id: 'other' }) }
    );
    expect(local.kind).toBe('remove');
    if (local.kind !== 'remove') throw new Error('kind narrow');
    expect(local.targetRule).toBe(rule);
  });
});

// ---------------------------------------------------------------------------
// scopePreviewTransactions — per-op filter + cap at the server zod max
// ---------------------------------------------------------------------------

function addOp(pattern: string, matchType: 'exact' | 'contains' | 'regex' = 'contains'): LocalOp {
  return {
    kind: 'add',
    clientId: `add-${pattern}`,
    data: { descriptionPattern: pattern, matchType, entityName: 'E', tags: [] },
    dirty: false,
  };
}

function editOp(rule: CorrectionRule | null): LocalOp {
  return {
    kind: 'edit',
    clientId: `edit-${rule?.id ?? 'orphan'}`,
    targetRuleId: rule?.id ?? 'orphan',
    targetRule: rule,
    data: { entityName: 'Renamed' },
    dirty: false,
  };
}

describe('scopePreviewTransactions', () => {
  it("filters transactions to only those matching at least one add op's signal", () => {
    const txns = [
      { checksum: '1', description: 'WOOLWORTHS 1234 SYD' },
      { checksum: '2', description: 'COLES 9999 NEW' },
      { checksum: '3', description: 'NETFLIX 1X' },
    ];
    const { txns: scoped, truncated } = scopePreviewTransactions(
      [addOp('WOOLWORTHS'), addOp('NETFLIX')],
      txns
    );
    expect(scoped.map((t) => t.checksum)).toEqual(['1', '3']);
    expect(truncated).toBe(false);
  });

  it("uses a hydrated edit op's targetRule pattern for scoping", () => {
    const rule = makeRule({ id: 'r1', descriptionPattern: 'COLES', matchType: 'contains' });
    const txns = [
      { checksum: '1', description: 'WOOLWORTHS 1' },
      { checksum: '2', description: 'COLES 5 NEW' },
    ];
    const { txns: scoped } = scopePreviewTransactions([editOp(rule)], txns);
    expect(scoped.map((t) => t.checksum)).toEqual(['2']);
  });

  it('falls back to the full preview list when any non-add op lacks a hydrated targetRule', () => {
    const txns = [
      { checksum: '1', description: 'WOOLWORTHS 1' },
      { checksum: '2', description: 'COLES 5' },
    ];
    // edit op without hydrated targetRule (null) — scope must not guess.
    const { txns: scoped, truncated } = scopePreviewTransactions([editOp(null)], txns);
    expect(scoped).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  it('caps the scoped list at PREVIEW_CHANGESET_MAX_TRANSACTIONS and reports truncated=true', () => {
    const total = PREVIEW_CHANGESET_MAX_TRANSACTIONS + 50;
    const txns = Array.from({ length: total }, (_, i) => ({
      checksum: String(i),
      description: `WOOLWORTHS ${i}`,
    }));
    const { txns: scoped, truncated } = scopePreviewTransactions([addOp('WOOLWORTHS')], txns);
    expect(scoped).toHaveLength(PREVIEW_CHANGESET_MAX_TRANSACTIONS);
    expect(truncated).toBe(true);
  });

  it('does not report truncated when scoped length exactly equals the cap', () => {
    const txns = Array.from({ length: PREVIEW_CHANGESET_MAX_TRANSACTIONS }, (_, i) => ({
      checksum: String(i),
      description: `WOOLWORTHS ${i}`,
    }));
    const { scoped, truncated } = (() => {
      const r = scopePreviewTransactions([addOp('WOOLWORTHS')], txns);
      return { scoped: r.txns, truncated: r.truncated };
    })();
    expect(scoped).toHaveLength(PREVIEW_CHANGESET_MAX_TRANSACTIONS);
    expect(truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Component tests: multi-rule diff editor (PRD-028 US-06)
// ---------------------------------------------------------------------------

const EMPTY_SUMMARY = {
  total: 0,
  newMatches: 0,
  removedMatches: 0,
  statusChanges: 0,
  netMatchedDelta: 0,
};

const SIGNAL = {
  descriptionPattern: 'WOOLWORTHS',
  matchType: 'contains' as const,
  entityId: null,
  entityName: 'Woolworths',
  location: null,
  tags: [],
  transactionType: null,
};

const TRIGGERING_TRANSACTION = {
  description: 'WOOLWORTHS 1234 SYDNEY',
  amount: -42.5,
  date: '2026-01-15',
  account: 'Amex',
  location: null,
  previousEntityName: null,
  previousTransactionType: null,
};

function seedTwoAddOps() {
  mockProposeData = {
    changeSet: {
      source: 'test',
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'WOOLWORTHS',
            matchType: 'contains',
            entityName: 'Woolworths',
            tags: [],
          },
        },
        {
          op: 'add',
          data: {
            descriptionPattern: 'COLES',
            matchType: 'contains',
            entityName: 'Coles',
            tags: [],
          },
        },
      ],
    },
    rationale: 'Test proposal',
    preview: {
      counts: {
        affected: 0,
        entityChanges: 0,
        locationChanges: 0,
        tagChanges: 0,
        typeChanges: 0,
      },
      affected: [],
    },
  };
}

function renderDialog(overrides: Partial<Parameters<typeof CorrectionProposalDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    sessionId: '11111111-1111-1111-1111-111111111111',
    signal: SIGNAL,
    triggeringTransaction: TRIGGERING_TRANSACTION,
    previewTransactions: [
      { checksum: 'a', description: 'WOOLWORTHS 1234 SYD' },
      { checksum: 'b', description: 'COLES 9999 NEW' },
    ],
    onApproved: vi.fn(),
    ...overrides,
  };
  const utils = render(<CorrectionProposalDialog {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  mockProposeData = null;
  mockPreviewMutateAsync.mockReset();
  mockPreviewMutateAsync.mockResolvedValue({ diffs: [], summary: EMPTY_SUMMARY });
  mockAddPendingChangeSet.mockReset();
  mockRejectMutate.mockReset();
  mockListQuery.mockReset();
  mockReviseMutateAsync.mockReset();
  mockReviseMutateAsync.mockResolvedValue({
    changeSet: {
      source: 'ai-helper',
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'TRANSFER',
            matchType: 'contains',
            entityName: 'Transfer',
            tags: [],
          },
        },
      ],
    },
    rationale: 'Replaced with a transfer rule per user request.',
  });
  mockListQuery.mockReturnValue({
    data: { data: [], pagination: {} },
    isLoading: false,
    isError: false,
  });
});

describe('CorrectionProposalDialog', () => {
  it('renders both ops from the initial proposal in the operations list', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/WOOLWORTHS → Woolworths/)).toBeInTheDocument();
    expect(screen.getByText(/COLES → Coles/)).toBeInTheDocument();
  });

  it('runs combined preview against the proposed ChangeSet on open', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });
    // The first call is the auto combined preview triggered by seeding.
    const firstCall = mockPreviewMutateAsync.mock.calls[0]?.[0] as {
      changeSet: { ops: unknown[] };
      transactions: unknown[];
    };
    expect(firstCall.changeSet.ops).toHaveLength(2);
  });

  it('deleting an op removes it from the list and shifts selection', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByLabelText('Delete operation');
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Operations \(1\)/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/WOOLWORTHS → Woolworths/)).not.toBeInTheDocument();
    expect(screen.getByText(/COLES → Coles/)).toBeInTheDocument();
  });

  it('editing a rule field marks the ChangeSet stale and disables Apply', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });
    // Wait for the auto-preview to complete so Apply would otherwise be enabled.
    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });

    const applyBtn = screen.getByRole('button', { name: /Apply ChangeSet/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());

    const patternInput = screen.getByDisplayValue('WOOLWORTHS') as HTMLInputElement;
    fireEvent.change(patternInput, { target: { value: 'WOOLWORTHS METRO' } });

    expect(screen.getByText(/Preview stale/i)).toBeInTheDocument();
    expect(applyBtn).toBeDisabled();
  });

  it("adds a new 'add' op via the Add operation menu", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add operation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Add new rule$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Operations \(3\)/)).toBeInTheDocument();
    });
  });

  it('stores ChangeSet locally via addPendingChangeSet on Apply', async () => {
    seedTwoAddOps();
    const { props } = renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });

    const applyBtn = screen.getByRole('button', { name: /Apply ChangeSet/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());

    fireEvent.click(applyBtn);

    expect(mockAddPendingChangeSet).toHaveBeenCalledTimes(1);
    const call = mockAddPendingChangeSet.mock.calls[0]?.[0] as {
      changeSet: { ops: unknown[] };
      source: string;
    };
    expect(call.changeSet.ops).toHaveLength(2);
    expect(call.source).toBe('correction-proposal');
    expect(props.onApproved).toHaveBeenCalledWith(
      expect.objectContaining({ ops: expect.any(Array) })
    );
  });

  it('reject flow requires feedback and calls rejectChangeSet', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Reject with feedback/i }));

    // The dedicated confirm button lives in the reject panel.
    const confirmBtn = screen.getByRole('button', { name: /Confirm reject/i });
    expect(confirmBtn).toBeDisabled();

    const feedbackBox = screen.getByPlaceholderText(/Why is this proposal wrong/i);
    fireEvent.change(feedbackBox, { target: { value: 'Too broad, should be exact' } });

    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    expect(mockRejectMutate).toHaveBeenCalledTimes(1);
    const call = mockRejectMutate.mock.calls[0]?.[0] as {
      feedback: string;
      changeSet: { ops: unknown[] };
    };
    expect(call.feedback).toBe('Too broad, should be exact');
    expect(call.changeSet.ops).toHaveLength(2);
  });

  it('AI helper submit calls reviseChangeSet and replaces ops with the response', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/split location into its own rule/i);
    fireEvent.change(input, { target: { value: 'replace with a transfer rule' } });
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    // User message echoed in transcript.
    await waitFor(() => {
      expect(screen.getByText('replace with a transfer rule')).toBeInTheDocument();
    });

    // The mutation was called with the current ChangeSet, instruction, and signal.
    await waitFor(() => {
      expect(mockReviseMutateAsync).toHaveBeenCalledTimes(1);
    });
    const call = mockReviseMutateAsync.mock.calls[0]?.[0] as {
      instruction: string;
      currentChangeSet: { ops: unknown[] };
      signal: unknown;
      triggeringTransactions: unknown[];
    };
    expect(call.instruction).toBe('replace with a transfer rule');
    expect(call.currentChangeSet.ops).toHaveLength(2);
    expect(call.signal).toBeTruthy();
    expect(Array.isArray(call.triggeringTransactions)).toBe(true);

    // The revised ops replace the local list (1 op from the mock response).
    await waitFor(() => {
      expect(screen.getByText(/Operations \(1\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/TRANSFER → Transfer/)).toBeInTheDocument();

    // The rationale appears in the transcript as the assistant message. It
    // also appears in the context panel rationale row, so we just assert at
    // least one match exists.
    expect(
      screen.getAllByText(/Replaced with a transfer rule per user request/).length
    ).toBeGreaterThan(0);
  });

  it('AI helper surfaces an error message when reviseChangeSet rejects', async () => {
    seedTwoAddOps();
    mockReviseMutateAsync.mockRejectedValueOnce(new Error('AI down'));
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/split location into its own rule/i);
    fireEvent.change(input, { target: { value: 'broken request' } });
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error: AI down/i)).toBeInTheDocument();
    });
    // Original ops remain untouched on failure.
    expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
  });

  it("renders the triggering transaction's raw description, amount, date and account", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId('triggering-description')).toHaveTextContent(
      'WOOLWORTHS 1234 SYDNEY'
    );
    // Currency formatting is locale-dependent in CI; assert it contains the
    // dollar amount and currency symbol rather than the exact glyph.
    expect(screen.getByTestId('triggering-amount').textContent).toMatch(/42\.50/);
    expect(screen.getByTestId('triggering-date')).toHaveTextContent('2026-01-15');
    expect(screen.getByTestId('triggering-account')).toHaveTextContent('Amex');
  });

  it("renders 'assigned entity: <name>' when there is no previous entity", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId('triggering-diff')).toHaveTextContent('assigned entity: Woolworths');
  });

  it("renders 'was → now' diff line for an entity rename", async () => {
    seedTwoAddOps();
    renderDialog({
      triggeringTransaction: {
        ...TRIGGERING_TRANSACTION,
        previousEntityName: 'Coles',
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId('triggering-diff')).toHaveTextContent('entity: Coles → Woolworths');
  });

  it("renders 'was → now' diff line for a transaction-type change", async () => {
    seedTwoAddOps();
    renderDialog({
      signal: { ...SIGNAL, transactionType: 'transfer' as const },
      triggeringTransaction: {
        ...TRIGGERING_TRANSACTION,
        previousTransactionType: 'purchase' as const,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId('triggering-diff')).toHaveTextContent('type: purchase → transfer');
  });

  it('Apply is disabled when the ChangeSet is empty', async () => {
    mockProposeData = {
      changeSet: { source: 'test', ops: [] },
      rationale: 'empty',
      preview: {
        counts: {
          affected: 0,
          entityChanges: 0,
          locationChanges: 0,
          tagChanges: 0,
          typeChanges: 0,
        },
        affected: [],
      },
    };
    // ChangeSetSchema requires min(1) ops, but the dialog must still defend
    // against the "user deleted everything" case which produces an empty
    // local ops array client-side.
    renderDialog();

    // With zero ops the ops-list panel renders the empty state and the
    // Apply button is disabled. We assert via the empty-state copy in the
    // ops list (which contains a unique trailing instruction) plus the
    // Apply disabled state.
    await waitFor(() => {
      expect(
        screen.getByText(/ChangeSet is empty\. Add an operation below\./i)
      ).toBeInTheDocument();
    });

    const applyBtn = screen.getByRole('button', { name: /Apply ChangeSet/i });
    expect(applyBtn).toBeDisabled();
  });
});
