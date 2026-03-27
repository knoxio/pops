import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockMutate = vi.fn();
const mockReset = vi.fn();
const mockMutation = vi.fn();
const mockProgressQuery = vi.fn();

vi.mock("../../lib/trpc", () => ({
  trpc: {
    finance: {
      imports: {
        processImport: {
          useMutation: (opts: unknown) => {
            mockMutation(opts);
            return mockMutationReturn();
          },
        },
        getImportProgress: {
          useQuery: (...args: unknown[]) => mockProgressQuery(...args),
        },
      },
    },
  },
}));

const mockNextStep = vi.fn();
const mockSetProcessSessionId = vi.fn();
const mockSetProcessedTransactions = vi.fn();

vi.mock("../../store/importStore", () => ({
  useImportStore: () => ({
    parsedTransactions: [{ date: "2026-01-01", description: "Test", amount: -50 }],
    setProcessSessionId: mockSetProcessSessionId,
    processSessionId: null,
    setProcessedTransactions: mockSetProcessedTransactions,
    nextStep: mockNextStep,
  }),
}));

import { ProcessingStep } from "./ProcessingStep";

let mockMutationReturn: () => Record<string, unknown>;

function setMutationState(overrides: Record<string, unknown> = {}) {
  mockMutationReturn = () => ({
    mutate: mockMutate,
    reset: mockReset,
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setMutationState();
  mockProgressQuery.mockReturnValue({
    data: undefined,
  });
});

describe("ProcessingStep", () => {
  it("auto-triggers processImport on mount", () => {
    render(<ProcessingStep />);
    expect(mockMutate).toHaveBeenCalledWith({
      transactions: [{ date: "2026-01-01", description: "Test", amount: -50 }],
      account: "Amex",
    });
  });

  it("shows Retry button when mutation fails", () => {
    setMutationState({
      isError: true,
      error: { message: "Network error" },
    });
    render(<ProcessingStep />);
    expect(screen.getByText("Processing Failed")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("calls reset and mutate when Retry is clicked", () => {
    setMutationState({
      isError: true,
      error: { message: "Network error" },
    });
    render(<ProcessingStep />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledTimes(2); // initial + retry
    expect(mockMutate).toHaveBeenLastCalledWith({
      transactions: [{ date: "2026-01-01", description: "Test", amount: -50 }],
      account: "Amex",
    });
  });

  it("does not show Retry button during normal processing", () => {
    setMutationState({ isPending: true });
    render(<ProcessingStep />);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("shows Retry button when progress status is failed", () => {
    mockProgressQuery.mockReturnValue({
      data: {
        status: "failed",
        errors: [{ error: "Server crashed" }],
      },
    });
    render(<ProcessingStep />);
    expect(screen.getByText("Processing Failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
