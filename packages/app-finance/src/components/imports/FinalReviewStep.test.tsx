import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Store mock state ---

const mockPrevStep = vi.fn();
const mockNextStep = vi.fn();

let storeState: Record<string, unknown> = {};

vi.mock("../../store/importStore", () => ({
  useImportStore: (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState,
}));

import { FinalReviewStep } from "./FinalReviewStep";

// --- Helpers ---

function makeStoreState(overrides: Partial<typeof storeState> = {}) {
  return {
    pendingEntities: [],
    pendingChangeSets: [],
    confirmedTransactions: [],
    processedTransactions: {
      matched: [],
      uncertain: [],
      failed: [],
      skipped: [],
    },
    prevStep: mockPrevStep,
    nextStep: mockNextStep,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeState = makeStoreState();
});

// --- Tests ---

describe("FinalReviewStep", () => {
  it("renders empty state when no pending changes", () => {
    render(<FinalReviewStep />);
    expect(screen.getByText("No pending changes to review.")).toBeDefined();
  });

  it("hides sections with zero items", () => {
    render(<FinalReviewStep />);
    expect(screen.queryByText("New Entities")).toBeNull();
    expect(screen.queryByText("Rule Changes")).toBeNull();
    expect(screen.queryByText("Transactions to Import")).toBeNull();
    expect(screen.queryByText("Tag Assignments")).toBeNull();
  });

  it("shows new entities section when pendingEntities present", () => {
    storeState = makeStoreState({
      pendingEntities: [
        { tempId: "temp:entity:1", name: "Woolworths", type: "merchant" },
        { tempId: "temp:entity:2", name: "Coles", type: "merchant" },
      ],
    });
    render(<FinalReviewStep />);
    expect(screen.getByText("Woolworths")).toBeDefined();
    expect(screen.getByText("Coles")).toBeDefined();
    expect(screen.getByText("(2)")).toBeDefined();
  });

  it("shows rule changes with correct badges", () => {
    storeState = makeStoreState({
      pendingChangeSets: [
        {
          tempId: "pcs-1",
          changeSet: {
            source: "import",
            ops: [
              { op: "add", data: { descriptionPattern: "WOOLWORTHS*" } },
              { op: "edit", id: "rule-abc123", data: { entityName: "Coles" } },
              { op: "disable", id: "rule-def456" },
            ],
          },
        },
      ],
    });
    render(<FinalReviewStep />);
    expect(screen.getByText("Add")).toBeDefined();
    expect(screen.getByText("Edit")).toBeDefined();
    expect(screen.getByText("Disable")).toBeDefined();
    expect(screen.getByText("WOOLWORTHS*")).toBeDefined();
    expect(screen.getByText("Coles")).toBeDefined();
    expect(screen.getByText("Rule rule-def")).toBeDefined();
  });

  it("shows transaction breakdown with AC labels (matched/corrected/manual)", () => {
    storeState = makeStoreState({
      confirmedTransactions: Array.from({ length: 5 }, (_, i) => ({ id: `t${i}` })),
      processedTransactions: {
        matched: [{ id: "m1" }, { id: "m2" }],
        uncertain: [{ id: "u1" }],
        failed: [{ id: "f1" }, { id: "f2" }],
        skipped: [],
      },
    });
    render(<FinalReviewStep />);
    expect(screen.getByText("Matched:")).toBeDefined();
    expect(screen.getByText("Corrected:")).toBeDefined();
    expect(screen.getByText("Manual:")).toBeDefined();
    // Should NOT show internal bucket names
    expect(screen.queryByText("Uncertain:")).toBeNull();
    expect(screen.queryByText("Failed:")).toBeNull();
  });

  it("shows tag assignment count", () => {
    storeState = makeStoreState({
      confirmedTransactions: [
        { id: "t1", tags: ["food", "groceries"] },
        { id: "t2", tags: ["transport"] },
        { id: "t3" },
      ],
    });
    render(<FinalReviewStep />);
    expect(screen.getByText(/3 tags will be applied across 2 transactions/)).toBeDefined();
  });

  it("defaults sections to collapsed when count > 10", () => {
    const manyEntities = Array.from({ length: 12 }, (_, i) => ({
      tempId: `temp:entity:${i}`,
      name: `Entity ${i}`,
      type: "merchant",
    }));
    storeState = makeStoreState({ pendingEntities: manyEntities });
    render(<FinalReviewStep />);
    // Section header visible but items not rendered (collapsed)
    expect(screen.getByText("(12)")).toBeDefined();
    expect(screen.queryByText("Entity 0")).toBeNull();
  });

  it("expands collapsed sections on click", () => {
    const manyEntities = Array.from({ length: 12 }, (_, i) => ({
      tempId: `temp:entity:${i}`,
      name: `Entity ${i}`,
      type: "merchant",
    }));
    storeState = makeStoreState({ pendingEntities: manyEntities });
    render(<FinalReviewStep />);
    // Click section header to expand
    fireEvent.click(screen.getByText("New Entities").closest("button")!);
    expect(screen.getByText("Entity 0")).toBeDefined();
  });

  it("calls prevStep and nextStep on button clicks", () => {
    render(<FinalReviewStep />);
    fireEvent.click(screen.getByText("Back"));
    expect(mockPrevStep).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Continue to Import"));
    expect(mockNextStep).toHaveBeenCalledOnce();
  });
});
