import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// --- Mock setup ---

const mockCreateCorrectionMutate = vi.fn();
const mockCreateEntityMutateAsync = vi.fn();
const mockEntitiesQuery = vi.fn();

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
              if (typeof opts.onSuccess === "function")
                (opts.onSuccess as () => void)();
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
    nextStep: mockNextStep,
    prevStep: mockPrevStep,
    findSimilar: mockFindSimilar,
  }),
}));

vi.mock("./EntityCreateDialog", () => ({
  EntityCreateDialog: () => null,
}));

vi.mock("./TransactionCard", () => ({
  TransactionCard: ({
    transaction,
    onAcceptAiSuggestion,
  }: {
    transaction: { description: string; entity?: { entityName?: string } };
    onAcceptAiSuggestion?: (t: unknown) => void;
  }) => {
    const React = require("react");
    return React.createElement(
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
    );
  },
}));

vi.mock("./TransactionGroup", () => ({
  TransactionGroup: ({
    group,
    onAcceptAll,
    onAcceptAiSuggestion,
  }: {
    group: { entityName: string; transactions: unknown[] };
    onAcceptAll: (txs: unknown[]) => void;
    onAcceptAiSuggestion: (t: unknown) => void;
  }) => {
    const React = require("react");
    return React.createElement(
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
      // Render individual accept buttons for each transaction in the group
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
    );
  },
}));

vi.mock("./EditableTransactionCard", () => ({
  EditableTransactionCard: () => null,
}));

vi.mock("../../lib/transaction-utils", () => ({
  groupTransactionsByEntity: (txs: unknown[]) =>
    txs.length > 0
      ? [
          {
            entityName: (txs[0] as { entity?: { entityName?: string } })?.entity?.entityName ?? "Unknown",
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
    Tabs: ({ children, value, onValueChange }: Record<string, unknown>) =>
      React.createElement(
        "div",
        { "data-testid": "tabs", "data-value": value },
        children as React.ReactNode
      ),
    TabsList: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { role: "tablist" }, children),
    TabsTrigger: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => React.createElement("button", { role: "tab", "data-value": value }, children),
    TabsContent: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => React.createElement("div", { "data-testid": `tab-${value}` }, children),
  };
});

import { ReviewStep } from "./ReviewStep";

// --- Helpers ---

function makeTx(
  description: string,
  overrides: Record<string, unknown> = {}
) {
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
  mockProcessedTransactions = {
    matched: [],
    uncertain: [],
    failed: [],
    skipped: [],
  };
});

// --- Tests ---

describe("ReviewStep — auto-apply rules", () => {
  it("saves correction when accepting AI suggestion", () => {
    mockProcessedTransactions = {
      matched: [],
      uncertain: [makeTx("WOOLWORTHS 1234 SYDNEY")],
      failed: [],
      skipped: [],
    };
    render(<ReviewStep />);

    const acceptBtn = screen.getByTestId("accept-WOOLWORTHS 1234 SYDNEY");
    fireEvent.click(acceptBtn);

    expect(mockCreateCorrectionMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        matchType: "contains",
        entityId: "ent-1",
        entityName: "Woolworths",
      })
    );
  });

  it("re-evaluates and moves matching uncertain transactions to matched", () => {
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

    // Toast should mention 1 more transaction (tx2 matched by the rule, tx1 was already moved by handleEntitySelect)
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Applied to 1 more transaction")
    );
  });

  it("shows 'Rule created' without count when no additional matches", () => {
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

    // Should have a "Rule created" toast without "Applied to" since no others match WOOLWORTHS
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/Rule created:.*Woolworths/)
    );
  });

  it("non-matching transactions remain in uncertain", () => {
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

    // Netflix transaction should not be in any "Rule created: Applied to N" toast
    // Only the Woolworths rule was created, Netflix doesn't match "WOOLWORTHS"
    const ruleToastCalls = mockToastSuccess.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("Applied to")
    );
    expect(ruleToastCalls).toHaveLength(0);
  });

  it("re-evaluates failed transactions too", () => {
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

    // Failed Woolworths transaction should be caught by re-evaluation
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Applied to 1 more transaction")
    );
  });
});
