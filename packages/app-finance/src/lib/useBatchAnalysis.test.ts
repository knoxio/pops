import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchAnalysis } from "./useBatchAnalysis";
import type { CorrectionEntry } from "./useBatchAnalysis";

// Mock trpc
const mockMutate = vi.fn();
let capturedOnSuccess: ((data: { proposals: unknown[] }) => void) | undefined;
vi.mock("./trpc", () => ({
  trpc: {
    core: {
      corrections: {
        generateRules: {
          useMutation: (opts: { onSuccess?: (data: { proposals: unknown[] }) => void }) => {
            // Store onSuccess so tests can trigger it
            capturedOnSuccess = opts.onSuccess;
            return {
              mutate: mockMutate,
              isPending: false,
            };
          },
        },
      },
    },
  },
}));

function makeCorrectionEntry(
  description: string,
  overrides?: Partial<CorrectionEntry>
): CorrectionEntry {
  return {
    description,
    entityName: "Test Entity",
    amount: -50,
    account: "ANZ",
    currentTags: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useBatchAnalysis", () => {
  it("starts with empty state", () => {
    const { result } = renderHook(() => useBatchAnalysis());
    expect(result.current.proposals).toEqual([]);
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.correctionCount).toBe(0);
  });

  it("tracks added corrections", () => {
    const { result } = renderHook(() => useBatchAnalysis());

    act(() => {
      result.current.addCorrection(makeCorrectionEntry("WOOLWORTHS"));
      result.current.addCorrection(makeCorrectionEntry("COLES"));
    });

    expect(result.current.correctionCount).toBe(2);
  });

  it("deduplicates corrections by description", () => {
    const { result } = renderHook(() => useBatchAnalysis());

    act(() => {
      result.current.addCorrection(makeCorrectionEntry("WOOLWORTHS"));
      result.current.addCorrection(makeCorrectionEntry("WOOLWORTHS"));
    });

    expect(result.current.correctionCount).toBe(1);
  });

  it("triggers analysis after reaching threshold (5) + debounce (3s)", () => {
    const { result } = renderHook(() => useBatchAnalysis());

    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.addCorrection(makeCorrectionEntry(`MERCHANT_${i}`));
      }
    });

    // Before debounce fires
    expect(mockMutate).not.toHaveBeenCalled();

    // After debounce
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({
      transactions: expect.arrayContaining([
        expect.objectContaining({ description: "MERCHANT_0" }),
      ]),
    });
  });

  it("does not trigger analysis before threshold", () => {
    const { result } = renderHook(() => useBatchAnalysis());

    act(() => {
      for (let i = 0; i < 4; i++) {
        result.current.addCorrection(makeCorrectionEntry(`MERCHANT_${i}`));
      }
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("seeds transactions and triggers if above threshold", () => {
    const { result } = renderHook(() => useBatchAnalysis());

    const seed = Array.from({ length: 6 }, (_, i) => makeCorrectionEntry(`SEED_${i}`));

    act(() => {
      result.current.seedTransactions(seed);
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("dismisses proposals", () => {
    const { result } = renderHook(() => useBatchAnalysis());

    // Simulate proposals arriving via onSuccess callback
    act(() => {
      capturedOnSuccess?.({
        proposals: [
          {
            descriptionPattern: "WOOLWORTHS",
            matchType: "contains",
            tags: ["Groceries"],
            reasoning: "test",
          },
          {
            descriptionPattern: "COLES",
            matchType: "contains",
            tags: ["Groceries"],
            reasoning: "test",
          },
        ],
      });
    });

    expect(result.current.proposals).toHaveLength(2);

    act(() => {
      result.current.dismissProposal("WOOLWORTHS");
    });

    expect(result.current.proposals).toHaveLength(1);
    expect(result.current.proposals[0]?.descriptionPattern).toBe("COLES");
  });

  it("removes accepted proposals", () => {
    const { result } = renderHook(() => useBatchAnalysis());

    act(() => {
      capturedOnSuccess?.({
        proposals: [
          {
            descriptionPattern: "WOOLWORTHS",
            matchType: "contains",
            tags: ["Groceries"],
            reasoning: "test",
          },
        ],
      });
    });

    expect(result.current.proposals).toHaveLength(1);

    act(() => {
      result.current.acceptProposal("WOOLWORTHS");
    });

    expect(result.current.proposals).toHaveLength(0);
  });
});
