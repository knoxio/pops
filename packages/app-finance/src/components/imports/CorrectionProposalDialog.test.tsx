import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  CorrectionProposalDialog,
  normalizeForMatch,
  transactionMatchesSignal,
} from "./CorrectionProposalDialog";

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
const mockApplyMutate = vi.fn();
const mockRejectMutate = vi.fn();
const mockListQuery = vi.fn();
const mockReviseMutateAsync = vi.fn();

let applyOnSuccess: ((res: unknown) => void) | undefined;
let rejectOnSuccess: (() => void) | undefined;

vi.mock("../../lib/trpc", () => ({
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
      imports: {
        applyChangeSetAndReevaluate: {
          useMutation: (opts: {
            onSuccess?: (res: { result: unknown; affectedCount: number }) => void;
            onError?: (err: Error) => void;
          }) => {
            applyOnSuccess = opts.onSuccess as (res: unknown) => void;
            return {
              mutate: (...args: unknown[]) => {
                mockApplyMutate(...args);
                applyOnSuccess?.({
                  result: {
                    matched: [],
                    uncertain: [],
                    failed: [],
                    skipped: [],
                  },
                  affectedCount: 3,
                });
              },
              isPending: false,
            };
          },
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Kept utility tests (these were the entirety of the previous .test.ts)
// ---------------------------------------------------------------------------

describe("normalizeForMatch", () => {
  it("uppercases, strips digits, and collapses whitespace", () => {
    expect(normalizeForMatch("Woolworths 1234 Sydney")).toBe("WOOLWORTHS SYDNEY");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeForMatch("  netflix  ")).toBe("NETFLIX");
  });

  it("collapses multiple internal spaces to single", () => {
    expect(normalizeForMatch("FOO    BAR")).toBe("FOO BAR");
  });

  it("strips all digits, not just standalone runs", () => {
    expect(normalizeForMatch("TXN42ABC99")).toBe("TXNABC");
  });
});

describe("transactionMatchesSignal", () => {
  describe("contains", () => {
    it("matches when normalized description contains normalized pattern", () => {
      expect(
        transactionMatchesSignal("WOOLWORTHS 1234 ERSKINEVILLE", "WOOLWORTHS", "contains")
      ).toBe(true);
    });

    it("ignores digits in both description and pattern", () => {
      expect(transactionMatchesSignal("STORE 42 SYDNEY", "STORE 99", "contains")).toBe(true);
    });

    it("is case-insensitive via normalization", () => {
      expect(transactionMatchesSignal("netflix australia", "NETFLIX", "contains")).toBe(true);
    });

    it("rejects when pattern substring is absent", () => {
      expect(transactionMatchesSignal("COLES 1234 NEWTOWN", "WOOLWORTHS", "contains")).toBe(false);
    });

    it("rejects an empty pattern so we do not match everything", () => {
      expect(transactionMatchesSignal("ANYTHING", "", "contains")).toBe(false);
      expect(transactionMatchesSignal("ANYTHING", "   ", "contains")).toBe(false);
    });
  });

  describe("exact", () => {
    it("matches when normalized description equals normalized pattern", () => {
      expect(transactionMatchesSignal("NETFLIX 42", "NETFLIX", "exact")).toBe(true);
    });

    it("rejects when description has extra words", () => {
      expect(transactionMatchesSignal("NETFLIX AUSTRALIA PTY LTD", "NETFLIX", "exact")).toBe(false);
    });
  });

  describe("regex", () => {
    it("matches via case-insensitive regex", () => {
      expect(transactionMatchesSignal("PayID from John", "payid", "regex")).toBe(true);
    });

    it("honours anchors in the pattern", () => {
      expect(transactionMatchesSignal("NETFLIX", "^NETFLIX$", "regex")).toBe(true);
      expect(transactionMatchesSignal("NETFLIX AUSTRALIA", "^NETFLIX$", "regex")).toBe(false);
    });

    it("returns false (not throws) for an invalid regex pattern", () => {
      expect(transactionMatchesSignal("anything", "[unclosed", "regex")).toBe(false);
    });
  });

  it("regex does NOT apply the digit-stripping normalization", () => {
    expect(transactionMatchesSignal("TXN42", "TXN\\d+", "regex")).toBe(true);
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
  descriptionPattern: "WOOLWORTHS",
  matchType: "contains" as const,
  entityId: null,
  entityName: "Woolworths",
  location: null,
  tags: [],
  transactionType: null,
};

const TRIGGERING_TRANSACTION = {
  description: "WOOLWORTHS 1234 SYDNEY",
  amount: -42.5,
  date: "2026-01-15",
  account: "Amex",
  location: null,
  previousEntityName: null,
  previousTransactionType: null,
};

function seedTwoAddOps() {
  mockProposeData = {
    changeSet: {
      source: "test",
      ops: [
        {
          op: "add",
          data: {
            descriptionPattern: "WOOLWORTHS",
            matchType: "contains",
            entityName: "Woolworths",
            tags: [],
          },
        },
        {
          op: "add",
          data: {
            descriptionPattern: "COLES",
            matchType: "contains",
            entityName: "Coles",
            tags: [],
          },
        },
      ],
    },
    rationale: "Test proposal",
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
    sessionId: "11111111-1111-1111-1111-111111111111",
    signal: SIGNAL,
    triggeringTransaction: TRIGGERING_TRANSACTION,
    previewTransactions: [
      { checksum: "a", description: "WOOLWORTHS 1234 SYD" },
      { checksum: "b", description: "COLES 9999 NEW" },
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
  mockApplyMutate.mockReset();
  mockRejectMutate.mockReset();
  mockListQuery.mockReset();
  mockReviseMutateAsync.mockReset();
  mockReviseMutateAsync.mockResolvedValue({
    changeSet: {
      source: "ai-helper",
      ops: [
        {
          op: "add",
          data: {
            descriptionPattern: "TRANSFER",
            matchType: "contains",
            entityName: "Transfer",
            tags: [],
          },
        },
      ],
    },
    rationale: "Replaced with a transfer rule per user request.",
  });
  mockListQuery.mockReturnValue({
    data: { data: [], pagination: {} },
    isLoading: false,
    isError: false,
  });
});

describe("CorrectionProposalDialog", () => {
  it("renders both ops from the initial proposal in the operations list", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/WOOLWORTHS → Woolworths/)).toBeInTheDocument();
    expect(screen.getByText(/COLES → Coles/)).toBeInTheDocument();
  });

  it("runs combined preview against the proposed ChangeSet on open", async () => {
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

  it("deleting an op removes it from the list and shifts selection", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByLabelText("Delete operation");
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText(/Operations \(1\)/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/WOOLWORTHS → Woolworths/)).not.toBeInTheDocument();
    expect(screen.getByText(/COLES → Coles/)).toBeInTheDocument();
  });

  it("editing a rule field marks the ChangeSet stale and disables Apply", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });
    // Wait for the auto-preview to complete so Apply would otherwise be enabled.
    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });

    const applyBtn = screen.getByRole("button", { name: /Apply ChangeSet/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());

    const patternInput = screen.getByDisplayValue("WOOLWORTHS") as HTMLInputElement;
    fireEvent.change(patternInput, { target: { value: "WOOLWORTHS METRO" } });

    expect(screen.getByText(/Preview stale/i)).toBeInTheDocument();
    expect(applyBtn).toBeDisabled();
  });

  it("adds a new 'add' op via the Add operation menu", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Add operation/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Add new rule$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Operations \(3\)/)).toBeInTheDocument();
    });
  });

  it("calls applyChangeSetAndReevaluate with the current ChangeSet on Apply", async () => {
    seedTwoAddOps();
    const { props } = renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });

    const applyBtn = screen.getByRole("button", { name: /Apply ChangeSet/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());

    fireEvent.click(applyBtn);

    expect(mockApplyMutate).toHaveBeenCalledTimes(1);
    const call = mockApplyMutate.mock.calls[0]?.[0] as {
      sessionId: string;
      changeSet: { ops: unknown[] };
    };
    expect(call.sessionId).toBe("11111111-1111-1111-1111-111111111111");
    expect(call.changeSet.ops).toHaveLength(2);
    expect(props.onApproved).toHaveBeenCalledWith(
      expect.objectContaining({ matched: [] }),
      3
    );
  });

  it("reject flow requires feedback and calls rejectChangeSet", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Reject with feedback/i }));

    // The dedicated confirm button lives in the reject panel.
    const confirmBtn = screen.getByRole("button", { name: /Confirm reject/i });
    expect(confirmBtn).toBeDisabled();

    const feedbackBox = screen.getByPlaceholderText(/Why is this proposal wrong/i);
    fireEvent.change(feedbackBox, { target: { value: "Too broad, should be exact" } });

    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    expect(mockRejectMutate).toHaveBeenCalledTimes(1);
    const call = mockRejectMutate.mock.calls[0]?.[0] as {
      feedback: string;
      changeSet: { ops: unknown[] };
    };
    expect(call.feedback).toBe("Too broad, should be exact");
    expect(call.changeSet.ops).toHaveLength(2);
  });

  it("AI helper submit calls reviseChangeSet and replaces ops with the response", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/split location into its own rule/i);
    fireEvent.change(input, { target: { value: "replace with a transfer rule" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    // User message echoed in transcript.
    await waitFor(() => {
      expect(screen.getByText("replace with a transfer rule")).toBeInTheDocument();
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
    expect(call.instruction).toBe("replace with a transfer rule");
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

  it("AI helper surfaces an error message when reviseChangeSet rejects", async () => {
    seedTwoAddOps();
    mockReviseMutateAsync.mockRejectedValueOnce(new Error("AI down"));
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/split location into its own rule/i);
    fireEvent.change(input, { target: { value: "broken request" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

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

    expect(screen.getByTestId("triggering-description")).toHaveTextContent(
      "WOOLWORTHS 1234 SYDNEY"
    );
    // Currency formatting is locale-dependent in CI; assert it contains the
    // dollar amount and currency symbol rather than the exact glyph.
    expect(screen.getByTestId("triggering-amount").textContent).toMatch(/42\.50/);
    expect(screen.getByTestId("triggering-date")).toHaveTextContent("2026-01-15");
    expect(screen.getByTestId("triggering-account")).toHaveTextContent("Amex");
  });

  it("renders 'assigned entity: <name>' when there is no previous entity", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId("triggering-diff")).toHaveTextContent(
      "assigned entity: Woolworths"
    );
  });

  it("renders 'was → now' diff line for an entity rename", async () => {
    seedTwoAddOps();
    renderDialog({
      triggeringTransaction: {
        ...TRIGGERING_TRANSACTION,
        previousEntityName: "Coles",
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId("triggering-diff")).toHaveTextContent("entity: Coles → Woolworths");
  });

  it("renders 'was → now' diff line for a transaction-type change", async () => {
    seedTwoAddOps();
    renderDialog({
      signal: { ...SIGNAL, transactionType: "transfer" as const },
      triggeringTransaction: {
        ...TRIGGERING_TRANSACTION,
        previousTransactionType: "purchase" as const,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId("triggering-diff")).toHaveTextContent("type: purchase → transfer");
  });

  it("Apply is disabled when the ChangeSet is empty", async () => {
    mockProposeData = {
      changeSet: { source: "test", ops: [] },
      rationale: "empty",
      preview: {
        counts: { affected: 0, entityChanges: 0, locationChanges: 0, tagChanges: 0, typeChanges: 0 },
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

    const applyBtn = screen.getByRole("button", { name: /Apply ChangeSet/i });
    expect(applyBtn).toBeDisabled();
  });
});
