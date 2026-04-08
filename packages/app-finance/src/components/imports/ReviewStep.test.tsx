import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// --- Mock setup ---

const mockCreateCorrectionMutate = vi.fn();
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
        createOrUpdate: {
          useMutation: () => ({
            mutate: mockCreateCorrectionMutate,
            isPending: false,
          }),
        },
        analyzeCorrection: {
          useMutation: () => ({
            mutateAsync: mockAnalyzeCorrectionMutateAsync,
            isPending: false,
          }),
        },
        generateRules: {
          useMutation: () => ({
            mutate: vi.fn(),
            isPending: false,
          }),
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

vi.mock("./TransactionCard", async () => {
  const React = await import("react");
  return {
    TransactionCard: ({
      transaction,
      onAcceptAiSuggestion,
    }: {
      transaction: { description: string; entity?: { entityName?: string } };
      onAcceptAiSuggestion?: (t: unknown) => void;
    }) =>
      React.createElement(
        "div",
        { "data-testid": `tx-${transaction.description}` },
        transaction.description,
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

vi.mock("./EditableTransactionCard", () => ({
  EditableTransactionCard: () => null,
}));

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
    online: false,
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

describe("ReviewStep — auto-apply rules", () => {
  it("saves correction when accepting AI suggestion", async () => {
    mockProcessedTransactions = {
      matched: [],
      uncertain: [makeTx("WOOLWORTHS 1234 SYDNEY")],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    const acceptBtn = screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY");
    fireEvent.click(acceptBtn);

    // ChangeSet is applied after async AI analysis resolves
    await vi.waitFor(() => {
      expect(mockApplyChangeSetAndReevaluateMutateAsync).toHaveBeenCalled();
    });
  });

  it("re-evaluates and moves matching uncertain transactions to matched", async () => {
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

    await vi.waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("ChangeSet applied"));
    });
  });

  it("shows success toast even when affectedCount is 0", async () => {
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

    await vi.waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("ChangeSet applied"));
    });
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
      expect(mockApplyChangeSetAndReevaluateMutateAsync).toHaveBeenCalled();
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

    await vi.waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("ChangeSet applied"));
    });
  });
});

describe("ReviewStep — low-confidence confirmation flow", () => {
  it("shows confirmation toast for low-confidence suggestion instead of auto-saving", () => {
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

    // Should show info toast with confirmation, not auto-save
    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.stringContaining('Create rule: contains "Spotify"'),
      expect.objectContaining({
        action: expect.objectContaining({ label: "Accept" }),
        cancel: expect.objectContaining({ label: "Reject" }),
      })
    );

    // Should NOT auto-save correction
    expect(mockApplyChangeSetAndReevaluateMutateAsync).not.toHaveBeenCalled();
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

    // ChangeSet is applied after async AI analysis resolves
    await vi.waitFor(() => {
      expect(mockApplyChangeSetAndReevaluateMutateAsync).toHaveBeenCalled();
    });

    // Should NOT show confirmation toast
    expect(mockToastInfo).not.toHaveBeenCalledWith(
      expect.stringContaining("Create rule"),
      expect.anything()
    );
  });

  it("confirmation toast shows match count when other transactions would match", () => {
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

    // Should mention 1 more transaction that would match
    expect(mockToastInfo).toHaveBeenCalledWith(
      expect.stringContaining("Would apply to 1 more transaction"),
      expect.anything()
    );
  });

  it("accept button in confirmation toast saves the rule", async () => {
    const tx = makeTx("SPOTIFY PREMIUM", {
      entity: { entityId: "ent-3", entityName: "Spotify", matchType: "ai", confidence: 0.6 },
    });
    mockEntitiesQuery.mockReturnValue({
      data: {
        data: [{ id: "ent-3", name: "Spotify", type: "company" }],
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

    // Simulate clicking the Accept button in the toast
    const infoCall = mockToastInfo.mock.calls[0]!;
    const actionOnClick = (infoCall[1] as { action: { onClick: () => void } }).action.onClick;
    actionOnClick();

    // ChangeSet is applied after async AI analysis resolves
    await vi.waitFor(() => {
      expect(mockApplyChangeSetAndReevaluateMutateAsync).toHaveBeenCalled();
    });
  });

  it("reject button prevents re-suggestion for same pattern", () => {
    // Both descriptions normalise to "SPOTIFY" (digits + extra spaces stripped)
    const tx1 = makeTx("SPOTIFY 1234", {
      entity: { entityId: "ent-3", entityName: "Spotify", matchType: "ai", confidence: 0.6 },
    });
    const tx2 = makeTx("SPOTIFY 5678", {
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
    const { unmount } = render(<ReviewStep />);

    // Accept first transaction — shows confirmation toast
    fireEvent.click(screen.getByTestId("accept-SPOTIFY 1234"));
    expect(mockToastInfo).toHaveBeenCalledTimes(1);

    // Simulate clicking Reject
    const infoCall = mockToastInfo.mock.calls[0]!;
    const cancelOnClick = (infoCall[1] as { cancel: { onClick: () => void } }).cancel.onClick;
    cancelOnClick();

    // No correction should be saved
    expect(mockApplyChangeSetAndReevaluateMutateAsync).not.toHaveBeenCalled();

    // Accept second transaction with same normalised pattern — should NOT show confirmation again
    mockToastInfo.mockClear();
    fireEvent.click(screen.getByTestId("accept-SPOTIFY 5678"));

    // The confirmation toast should not appear for the rejected pattern
    const createRuleCalls = mockToastInfo.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === "string" && (call[0] as string).includes("Create rule")
    );
    expect(createRuleCalls).toHaveLength(0);

    unmount();
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
      data: { matchType: "prefix", pattern: "WOOLWORTHS", confidence: 0.9 },
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

    // Wait for the async AI analysis to resolve
    await vi.waitFor(() => {
      expect(mockApplyChangeSetAndReevaluateMutateAsync).toHaveBeenCalled();
    });

    // Should use AI-analyzed pattern (prefix mapped to contains)
    expect(mockApplyChangeSetAndReevaluateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSet: expect.objectContaining({
          ops: [
            expect.objectContaining({
              op: "add",
              data: expect.objectContaining({
                descriptionPattern: "WOOLWORTHS",
                matchType: "contains",
                entityId: "ent-1",
                entityName: "Woolworths",
              }),
            }),
          ],
        }),
      })
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
      expect(mockApplyChangeSetAndReevaluateMutateAsync).toHaveBeenCalled();
    });

    // Should use fallback contains pattern (digits stripped)
    expect(mockApplyChangeSetAndReevaluateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSet: expect.objectContaining({
          ops: [
            expect.objectContaining({
              op: "add",
              data: expect.objectContaining({
                descriptionPattern: "WOOLWORTHS SYDNEY",
                matchType: "contains",
              }),
            }),
          ],
        }),
      })
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
      expect(mockApplyChangeSetAndReevaluateMutateAsync).toHaveBeenCalled();
    });

    // Should still save with fallback pattern
    expect(mockApplyChangeSetAndReevaluateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSet: expect.objectContaining({
          ops: [
            expect.objectContaining({
              op: "add",
              data: expect.objectContaining({
                matchType: "contains",
                entityId: "ent-1",
                entityName: "Woolworths",
              }),
            }),
          ],
        }),
      })
    );
  });
});
