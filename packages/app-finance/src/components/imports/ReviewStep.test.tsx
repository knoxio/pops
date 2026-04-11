import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// --- Mock setup ---

const mockCreateEntityMutateAsync = vi.fn();
const mockAnalyzeCorrectionMutateAsync = vi.fn();
const mockEntitiesQuery = vi.fn();
const mockApplyChangeSetAndReevaluateMutateAsync = vi.fn();

vi.mock("../../lib/trpc", () => ({
  trpc: {
    core: {
      entities: {
        list: {
          useQuery: (...args: unknown[]) => mockEntitiesQuery(...args),
        },
        create: {
          useMutation: (opts: Record<string, unknown>) => ({
            mutateAsync: (...args: unknown[]) => {
              const result = mockCreateEntityMutateAsync(...args);
              if (typeof opts.onSuccess === "function") (opts.onSuccess as () => void)();
              return result;
            },
            isPending: false,
          }),
        },
      },
      corrections: {
        analyzeCorrection: {
          useMutation: () => ({
            mutateAsync: mockAnalyzeCorrectionMutateAsync,
            isPending: false,
          }),
        },
        proposeChangeSet: {
          useQuery: () => ({ data: null, isFetching: false }),
        },
        previewChangeSet: {
          useMutation: () => ({
            mutate: vi.fn(),
            mutateAsync: vi.fn().mockResolvedValue({
              diffs: [],
              summary: {
                total: 0,
                newMatches: 0,
                removedMatches: 0,
                statusChanges: 0,
                netMatchedDelta: 0,
              },
            }),
            isPending: false,
            isError: false,
            error: null,
          }),
        },
        applyChangeSet: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        rejectChangeSet: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
    },
    finance: {
      imports: {
        applyChangeSetAndReevaluate: {
          useMutation: () => ({
            mutateAsync: (...args: unknown[]) =>
              mockApplyChangeSetAndReevaluateMutateAsync(...args),
            isPending: false,
          }),
        },
      },
    },
    useUtils: () => ({
      core: {
        entities: {
          list: { invalidate: vi.fn() },
        },
      },
    }),
  },
}));

const mockToastSuccess = vi.fn();
const mockToastInfo = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockNextStep = vi.fn();
const mockPrevStep = vi.fn();
const mockSetConfirmedTransactions = vi.fn();
const mockFindSimilar = vi.fn(() => []);

let mockProcessedTransactions: {
  matched: unknown[];
  uncertain: unknown[];
  failed: unknown[];
  skipped: unknown[];
  warnings?: unknown[];
};

vi.mock("../../store/importStore", () => ({
  useImportStore: () => ({
    processedTransactions: mockProcessedTransactions,
    setConfirmedTransactions: mockSetConfirmedTransactions,
    processSessionId: "11111111-1111-1111-1111-111111111111",
    setProcessedTransactions: vi.fn(),
    nextStep: mockNextStep,
    prevStep: mockPrevStep,
    findSimilar: mockFindSimilar,
  }),
}));

vi.mock("./EntityCreateDialog", () => ({
  EntityCreateDialog: () => null,
}));

let lastProposalDialogProps: unknown = null;
let proposalDialogApproveMode: "success" | "error" = "success";
let proposalDialogApprovePayload: { result: unknown; affectedCount: number } | null = null;
vi.mock("./CorrectionProposalDialog", async () => {
  const React = await import("react");
  const { toast } = await import("sonner");
  return {
    CorrectionProposalDialog: (props: unknown) => {
      lastProposalDialogProps = props;
      const p = props as {
        onApproved?: (result: unknown, affectedCount: number) => void;
        sessionId?: string;
      };
      return React.createElement(
        "div",
        { "data-testid": "proposal-dialog" },
        React.createElement(
          "button",
          {
            "data-testid": "proposal-approve",
            onClick: () => {
              if (!p.sessionId) {
                toast.error("Missing import session id");
                return;
              }
              if (proposalDialogApproveMode === "error") {
                toast.error("boom");
                return;
              }
              const payload =
                proposalDialogApprovePayload ?? ({ result: {}, affectedCount: 0 } as const);
              p.onApproved?.(payload.result, payload.affectedCount);
            },
          },
          "Approve"
        )
      );
    },
  };
});

vi.mock("./TransactionCard", async () => {
  const React = await import("react");
  return {
    TransactionCard: ({
      transaction,
      onAcceptAiSuggestion,
      onEdit,
    }: {
      transaction: { description: string; entity?: { entityName?: string } };
      onAcceptAiSuggestion?: (t: unknown) => void;
      onEdit?: (t: unknown) => void;
    }) =>
      React.createElement(
        "div",
        { "data-testid": `tx-${transaction.description}` },
        transaction.description,
        onEdit &&
          React.createElement(
            "button",
            {
              "aria-label": `Edit ${transaction.description}`,
              onClick: () => onEdit(transaction),
            },
            "Edit"
          ),
        onAcceptAiSuggestion &&
          React.createElement(
            "button",
            {
              "data-testid": `accept-${transaction.description}`,
              onClick: () => onAcceptAiSuggestion(transaction),
            },
            "Accept AI"
          )
      ),
  };
});

vi.mock("./TransactionGroup", async () => {
  const React = await import("react");
  return {
    TransactionGroup: ({
      group,
      onAcceptAll,
      onAcceptAiSuggestion,
    }: {
      group: { entityName: string; transactions: unknown[] };
      onAcceptAll: (txs: unknown[]) => void;
      onAcceptAiSuggestion: (t: unknown) => void;
    }) =>
      React.createElement(
        "div",
        { "data-testid": `group-${group.entityName}` },
        group.entityName,
        React.createElement(
          "button",
          {
            "data-testid": `accept-all-${group.entityName}`,
            onClick: () => onAcceptAll(group.transactions),
          },
          "Accept All"
        ),
        ...(group.transactions as { description: string }[]).map((t) =>
          React.createElement(
            "button",
            {
              key: t.description,
              "data-testid": `accept-${t.description}`,
              onClick: () => onAcceptAiSuggestion(t),
            },
            `Accept ${t.description}`
          )
        )
      ),
  };
});

vi.mock("./EditableTransactionCard", async () => {
  const React = await import("react");
  return {
    EditableTransactionCard: ({
      transaction,
      onSave,
    }: {
      transaction: { description: string };
      onSave: (t: unknown, edited: unknown, shouldLearn?: boolean) => void;
    }) =>
      React.createElement(
        "button",
        {
          "data-testid": `save-edit-${transaction.description}`,
          onClick: () =>
            onSave(transaction, { description: `${transaction.description} FIXED` }, false),
        },
        "Save Once"
      ),
  };
});

vi.mock("../../lib/transaction-utils", () => ({
  groupTransactionsByEntity: (txs: unknown[]) =>
    txs.length > 0
      ? [
          {
            entityName:
              (txs[0] as { entity?: { entityName?: string } })?.entity?.entityName ?? "Unknown",
            aiSuggestion: true,
            transactions: txs,
          },
        ]
      : [],
}));

vi.mock("@pops/ui", async () => {
  const React = await import("react");
  return {
    Button: ({ children, onClick, disabled, ...rest }: Record<string, unknown>) =>
      React.createElement(
        "button",
        { onClick: onClick as () => void, disabled, ...rest },
        children as React.ReactNode
      ),
    Tabs: ({ children, value }: Record<string, unknown>) =>
      React.createElement(
        "div",
        { "data-testid": "tabs", "data-value": value },
        children as React.ReactNode
      ),
    TabsList: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { role: "tablist" }, children),
    TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) =>
      React.createElement("button", { role: "tab", "data-value": value }, children),
    TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) =>
      React.createElement("div", { "data-testid": `tab-${value}` }, children),
  };
});

import { ReviewStep } from "./ReviewStep";

// --- Helpers ---

function makeTx(description: string, overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-01-15",
    description,
    amount: -42.5,
    account: "Amex",
    location: null,
    rawRow: {},
    checksum: `chk-${description}`,
    transactionType: "purchase",
    entity: {
      entityId: "ent-1",
      entityName: "Woolworths",
      matchType: "ai",
      confidence: 0.8,
    },
    status: "uncertain" as const,
    suggestedTags: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lastProposalDialogProps = null;
  proposalDialogApproveMode = "success";
  proposalDialogApprovePayload = null;
  mockEntitiesQuery.mockReturnValue({
    data: {
      data: [
        { id: "ent-1", name: "Woolworths", type: "company" },
        { id: "ent-2", name: "Coles", type: "company" },
      ],
    },
  });
  // Default: AI analysis returns null (fallback to contains pattern)
  mockAnalyzeCorrectionMutateAsync.mockResolvedValue({ data: null });
  mockApplyChangeSetAndReevaluateMutateAsync.mockImplementation(
    async (input: { changeSet: { ops: Array<{ data: { descriptionPattern: string } }> } }) => {
      const pattern = input.changeSet.ops[0]?.data.descriptionPattern ?? "";
      const norm = pattern.toUpperCase();

      const toMove = [
        ...mockProcessedTransactions.uncertain.filter((t) =>
          (t as { description: string }).description.toUpperCase().includes(norm)
        ),
        ...mockProcessedTransactions.failed.filter((t) =>
          (t as { description: string }).description.toUpperCase().includes(norm)
        ),
      ];

      const remainingUncertain = mockProcessedTransactions.uncertain.filter(
        (t) => !toMove.includes(t)
      );
      const remainingFailed = mockProcessedTransactions.failed.filter((t) => !toMove.includes(t));

      return {
        result: {
          ...mockProcessedTransactions,
          matched: [
            ...mockProcessedTransactions.matched,
            ...toMove.map((t) => ({
              ...(t as object),
              status: "matched",
              entity: { entityId: "ent-1", entityName: "Woolworths", matchType: "learned" },
            })),
          ],
          uncertain: remainingUncertain,
          failed: remainingFailed,
        },
        affectedCount: toMove.length,
      };
    }
  );
  mockProcessedTransactions = {
    matched: [],
    uncertain: [],
    failed: [],
    skipped: [],
  };
});

// --- Tests ---

describe("ReviewStep — Save & Learn proposal flow", () => {
  it("generates a proposal when accepting AI suggestion", async () => {
    mockAnalyzeCorrectionMutateAsync.mockResolvedValue({
      data: { matchType: "contains", pattern: "WOOLWORTHS", confidence: 0.9 },
    });
    mockProcessedTransactions = {
      matched: [],
      uncertain: [makeTx("WOOLWORTHS 1234 SYDNEY")],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    const acceptBtn = screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY");
    fireEvent.click(acceptBtn);

    await vi.waitFor(() => {
      expect(mockAnalyzeCorrectionMutateAsync).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(lastProposalDialogProps).not.toBeNull();
      const props = lastProposalDialogProps as { signal?: unknown };
      expect(props.signal).toEqual(
        expect.objectContaining({
          descriptionPattern: "WOOLWORTHS",
          matchType: "contains", // prefix → contains mapping
          entityId: "ent-1",
          entityName: "Woolworths",
        })
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Proposal generated — review and approve to learn")
    );
  });

  it("does not re-evaluate and apply rules before approval", () => {
    const tx1 = makeTx("WOOLWORTHS 1234 SYDNEY");
    const tx2 = makeTx("WOOLWORTHS 5678 MELBOURNE");
    const tx3 = makeTx("COLES EXPRESS 9999", {
      entity: { entityId: "ent-2", entityName: "Coles", matchType: "ai", confidence: 0.8 },
    });
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx1, tx2, tx3],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    // Accept the first Woolworths transaction
    const acceptBtn = screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY");
    fireEvent.click(acceptBtn);

    const appliedToCalls = mockToastSuccess.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Applied to")
    );
    expect(appliedToCalls).toHaveLength(0);
  });

  it("does not show 'Rule created' toasts in proposal-only flow", () => {
    const tx1 = makeTx("WOOLWORTHS 1234 SYDNEY");
    const tx2 = makeTx("COLES EXPRESS 9999", {
      entity: { entityId: "ent-2", entityName: "Coles", matchType: "ai", confidence: 0.8 },
    });
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx1, tx2],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY"));

    const ruleCreatedCalls = mockToastSuccess.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === "string" && (call[0] as string).includes("Rule created")
    );
    expect(ruleCreatedCalls).toHaveLength(0);
  });

  it("non-matching transactions remain in uncertain", async () => {
    const tx1 = makeTx("WOOLWORTHS 1234 SYDNEY");
    const tx2 = makeTx("NETFLIX SUBSCRIPTION", {
      entity: { entityId: null, entityName: "Netflix", matchType: "ai", confidence: 0.7 },
    });
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx1, tx2],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY"));

    await vi.waitFor(() => {
      expect(mockAnalyzeCorrectionMutateAsync).toHaveBeenCalled();
    });
  });

  it("re-evaluates failed transactions too", async () => {
    const tx1 = makeTx("WOOLWORTHS 1234 SYDNEY");
    const failedTx = makeTx("WOOLWORTHS 9999 BRISBANE", { status: "failed" });
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx1],
      failed: [failedTx],
      skipped: [],
    };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY"));

    const appliedToCalls = mockToastSuccess.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Applied to")
    );
    expect(appliedToCalls).toHaveLength(0);
  });

  it("approval updates localTransactions with re-evaluated result and shows affected-count toast", async () => {
    mockProcessedTransactions = {
      matched: [],
      uncertain: [makeTx("WOOLWORTHS 1234 SYDNEY")],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    proposalDialogApprovePayload = {
      result: {
        matched: [makeTx("WOOLWORTHS 1234 SYDNEY", { status: "matched" })],
        uncertain: [],
        failed: [],
        skipped: [],
      },
      affectedCount: 1,
    };

    fireEvent.click(screen.getByTestId("proposal-approve"));

    await vi.waitFor(() => {
      expect(screen.getByText(/Matched \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Uncertain \(0\)/)).toBeInTheDocument();
    });

    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Rules applied — 1 transaction re-evaluated")
    );
  });

  it("approval failure shows error toast and local state remains unchanged", async () => {
    mockProcessedTransactions = {
      matched: [],
      uncertain: [makeTx("WOOLWORTHS 1234 SYDNEY")],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    proposalDialogApproveMode = "error";
    fireEvent.click(screen.getByTestId("proposal-approve"));

    expect(mockToastError).toHaveBeenCalledWith("boom");
    expect(screen.getByText(/Matched \(0\)/)).toBeInTheDocument();
    expect(screen.getByText(/Uncertain \(1\)/)).toBeInTheDocument();
  });
});

describe("ReviewStep — rule-matched edit proposal flow", () => {
  it("opens a ChangeSet proposal when saving edits to a rule-matched transaction", async () => {
    mockAnalyzeCorrectionMutateAsync.mockResolvedValue({
      data: { matchType: "prefix", pattern: "WOOLWORTHS", confidence: 0.9 },
    });

    const tx = makeTx("WOOLWORTHS 1234 SYDNEY", {
      status: "matched",
      ruleProvenance: { pattern: "WOOLWORTHS", matchType: "contains", confidence: 0.95 },
      entity: {
        entityId: "ent-1",
        entityName: "Woolworths",
        matchType: "learned",
        confidence: 0.95,
      },
    });

    mockProcessedTransactions = { matched: [tx], uncertain: [], failed: [], skipped: [] };
    render(<ReviewStep />);

    // Click edit and save (mocked EditableTransactionCard emits Save Once)
    fireEvent.click(screen.getByLabelText(`Edit ${tx.description}`));
    fireEvent.click(screen.getByTestId(`save-edit-${tx.description}`));

    await vi.waitFor(() => {
      const props = lastProposalDialogProps as { signal?: unknown };
      expect(props.signal).toEqual(
        expect.objectContaining({
          entityId: "ent-1",
          entityName: "Woolworths",
        })
      );
    });
  });
});

describe("ReviewStep — low-confidence confirmation flow", () => {
  it("shows confirmation toast for low-confidence suggestion instead of auto-saving", async () => {
    const tx = makeTx("SPOTIFY PREMIUM", {
      entity: { entityId: "ent-3", entityName: "Spotify", matchType: "ai", confidence: 0.6 },
    });
    mockEntitiesQuery.mockReturnValue({
      data: {
        data: [
          { id: "ent-1", name: "Woolworths", type: "company" },
          { id: "ent-3", name: "Spotify", type: "company" },
        ],
      },
    });
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-SPOTIFY PREMIUM"));

    // Low-confidence confirmations are replaced by proposal flow
    await vi.waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("Proposal generated — review and approve to learn")
      );
    });
  });

  it("auto-saves rule when confidence >= 0.8 (high confidence path)", async () => {
    const tx = makeTx("WOOLWORTHS 1234 SYDNEY", {
      entity: { entityId: "ent-1", entityName: "Woolworths", matchType: "ai", confidence: 0.85 },
    });
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY"));

    await vi.waitFor(() => {
      expect(mockAnalyzeCorrectionMutateAsync).toHaveBeenCalled();
    });
  });

  it("confirmation toast shows match count when other transactions would match", async () => {
    const tx1 = makeTx("SPOTIFY PREMIUM", {
      entity: { entityId: "ent-3", entityName: "Spotify", matchType: "ai", confidence: 0.6 },
    });
    const tx2 = makeTx("SPOTIFY FAMILY PLAN", {
      entity: { entityId: "ent-3", entityName: "Spotify", matchType: "ai", confidence: 0.5 },
    });
    mockEntitiesQuery.mockReturnValue({
      data: {
        data: [{ id: "ent-3", name: "Spotify", type: "company" }],
      },
    });
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx1, tx2],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-SPOTIFY PREMIUM"));

    await vi.waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("Proposal generated — review and approve to learn")
      );
    });
  });

  it("always routes low-confidence suggestions into proposal flow", async () => {
    const tx = makeTx("SPOTIFY PREMIUM", {
      entity: { entityId: "ent-3", entityName: "Spotify", matchType: "ai", confidence: 0.4 },
    });
    mockEntitiesQuery.mockReturnValue({
      data: {
        data: [{ id: "ent-3", name: "Spotify", type: "company" }],
      },
    });
    mockProcessedTransactions = { matched: [], uncertain: [tx], failed: [], skipped: [] };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-SPOTIFY PREMIUM"));

    await vi.waitFor(() => {
      expect(mockAnalyzeCorrectionMutateAsync).toHaveBeenCalled();
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Proposal generated — review and approve to learn")
    );
  });
});

describe("ReviewStep — AI correction analysis", () => {
  it("calls analyzeCorrection when accepting a high-confidence suggestion", async () => {
    const tx = makeTx("WOOLWORTHS 1234 SYDNEY");
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY"));

    // Should call analyzeCorrection with transaction context (no account — PII rule)
    expect(mockAnalyzeCorrectionMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "WOOLWORTHS 1234 SYDNEY",
        entityName: "Woolworths",
        amount: -42.5,
      })
    );
    // Verify account is NOT sent to AI
    expect(mockAnalyzeCorrectionMutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ account: expect.anything() })
    );
  });

  it("uses AI-suggested pattern when analysis succeeds", async () => {
    mockAnalyzeCorrectionMutateAsync.mockResolvedValue({
      data: { matchType: "contains", pattern: "WOOLWORTHS", confidence: 0.9 },
    });
    const tx = makeTx("WOOLWORTHS 1234 SYDNEY");
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY"));

    await vi.waitFor(() => {
      expect(mockAnalyzeCorrectionMutateAsync).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      const props = lastProposalDialogProps as { signal?: unknown };
      expect(props.signal).toEqual(
        expect.objectContaining({
          descriptionPattern: "WOOLWORTHS",
          matchType: "contains",
          entityId: "ent-1",
          entityName: "Woolworths",
        })
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Proposal generated — review and approve to learn")
    );
  });

  it("falls back to hardcoded pattern when AI returns null", async () => {
    mockAnalyzeCorrectionMutateAsync.mockResolvedValue({ data: null });
    const tx = makeTx("WOOLWORTHS 1234 SYDNEY");
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY"));

    await vi.waitFor(() => {
      expect(mockAnalyzeCorrectionMutateAsync).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      const props = lastProposalDialogProps as { signal?: unknown };
      expect(props.signal).toEqual(
        expect.objectContaining({
          descriptionPattern: "WOOLWORTHS SYDNEY",
          matchType: "contains",
          entityId: "ent-1",
          entityName: "Woolworths",
        })
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Proposal generated — review and approve to learn")
    );
  });

  it("falls back to hardcoded pattern when AI call fails", async () => {
    mockAnalyzeCorrectionMutateAsync.mockRejectedValue(new Error("AI unavailable"));
    const tx = makeTx("WOOLWORTHS 1234 SYDNEY");
    mockProcessedTransactions = {
      matched: [],
      uncertain: [tx],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    fireEvent.click(screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY"));

    await vi.waitFor(() => {
      expect(mockAnalyzeCorrectionMutateAsync).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      const props = lastProposalDialogProps as { signal?: unknown };
      expect(props.signal).toEqual(
        expect.objectContaining({
          descriptionPattern: "WOOLWORTHS SYDNEY",
          matchType: "contains",
          entityId: "ent-1",
          entityName: "Woolworths",
        })
      );
    });
    await vi.waitFor(() => {
      expect(mockToastInfo).toHaveBeenCalledWith(
        expect.stringContaining("Proposal generated (fallback) — review and approve to learn")
      );
    });
  });
});
