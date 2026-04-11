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

const emptyProcessed = {
  matched: [],
  uncertain: [],
  failed: [],
  skipped: [],
  warnings: undefined,
};

let mockProcessedTransactions: typeof emptyProcessed = emptyProcessed;
let mockParsedTransactionsFingerprint = "fp-current";
let mockProcessedForFingerprint: string | null = null;

vi.mock("../../store/importStore", () => ({
  useImportStore: () => ({
    parsedTransactions: [{ date: "2026-01-01", description: "Test", amount: -50 }],
    parsedTransactionsFingerprint: mockParsedTransactionsFingerprint,
    processedForFingerprint: mockProcessedForFingerprint,
    processedTransactions: mockProcessedTransactions,
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
  mockProcessedTransactions = emptyProcessed;
  mockParsedTransactionsFingerprint = "fp-current";
  mockProcessedForFingerprint = null;
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

  describe("when already processed (Back navigation)", () => {
    it("does NOT re-run the AI pipeline and shows Continue instead (fingerprints match)", () => {
      mockProcessedTransactions = {
        ...emptyProcessed,
        matched: [
          // Minimal shape — ProcessingStep only checks array lengths.
          { description: "Existing" } as never,
        ],
      };
      mockParsedTransactionsFingerprint = "fp-same";
      mockProcessedForFingerprint = "fp-same";
      render(<ProcessingStep />);
      expect(mockMutate).not.toHaveBeenCalled();
      expect(screen.getByText("Already processed")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue to Review" })).toBeInTheDocument();
    });

    it("calls nextStep when Continue is clicked", () => {
      mockProcessedTransactions = {
        ...emptyProcessed,
        uncertain: [{ description: "Existing" } as never],
      };
      mockParsedTransactionsFingerprint = "fp-same";
      mockProcessedForFingerprint = "fp-same";
      render(<ProcessingStep />);
      fireEvent.click(screen.getByRole("button", { name: "Continue to Review" }));
      expect(mockNextStep).toHaveBeenCalledTimes(1);
    });

    it("DOES re-run the pipeline when the parsed fingerprint has diverged from processedForFingerprint", () => {
      // Stale cached results (fingerprint was 'old'), but the live parsed
      // input now fingerprints to 'new' — the user re-mapped columns in
      // Step 2 and came forward again. Short-circuit must NOT fire.
      mockProcessedTransactions = {
        ...emptyProcessed,
        matched: [{ description: "Stale" } as never],
      };
      mockParsedTransactionsFingerprint = "fp-new";
      mockProcessedForFingerprint = "fp-old";
      render(<ProcessingStep />);
      expect(screen.queryByText("Already processed")).not.toBeInTheDocument();
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it("DOES re-run the pipeline when processedForFingerprint is still null (first run)", () => {
      // Processed arrays happen to be empty but processedForFingerprint is
      // null, meaning no successful run has pinned them yet. Short-circuit
      // gate must not fire off null equality alone.
      mockProcessedTransactions = emptyProcessed;
      mockParsedTransactionsFingerprint = "fp-current";
      mockProcessedForFingerprint = null;
      render(<ProcessingStep />);
      expect(screen.queryByText("Already processed")).not.toBeInTheDocument();
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
  });
});
