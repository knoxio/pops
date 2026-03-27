import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BatchProposalsPanel } from "./BatchProposalsPanel";
import type { ProposedRule } from "../../lib/useBatchAnalysis";

// Mock trpc
const mockMutate = vi.fn();
vi.mock("../../lib/trpc", () => ({
  trpc: {
    core: {
      corrections: {
        createOrUpdate: {
          useMutation: () => ({
            mutate: mockMutate,
            isPending: false,
          }),
        },
      },
    },
  },
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const sampleProposals: ProposedRule[] = [
  {
    descriptionPattern: "WOOLWORTHS",
    matchType: "contains",
    tags: ["Groceries", "Essentials"],
    reasoning: "Common supermarket chain",
  },
  {
    descriptionPattern: "NETFLIX",
    matchType: "exact",
    tags: ["Entertainment"],
    reasoning: "Streaming subscription",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BatchProposalsPanel", () => {
  it("renders nothing when no proposals and not analyzing", () => {
    const { container } = render(
      <BatchProposalsPanel
        proposals={[]}
        isAnalyzing={false}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows analyzing state when isAnalyzing is true", () => {
    render(
      <BatchProposalsPanel
        proposals={[]}
        isAnalyzing={true}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText("AI-Suggested Rules")).toBeInTheDocument();
    expect(screen.getByText("Analyzing corrections...")).toBeInTheDocument();
  });

  it("renders proposals with pattern, matchType, and tags", () => {
    render(
      <BatchProposalsPanel
        proposals={sampleProposals}
        isAnalyzing={false}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("WOOLWORTHS")).toBeInTheDocument();
    expect(screen.getByText("contains")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Essentials")).toBeInTheDocument();
    expect(screen.getByText("Common supermarket chain")).toBeInTheDocument();

    expect(screen.getByText("NETFLIX")).toBeInTheDocument();
    expect(screen.getByText("exact")).toBeInTheDocument();
    expect(screen.getByText("Entertainment")).toBeInTheDocument();
  });

  it("shows proposal count badge", () => {
    render(
      <BatchProposalsPanel
        proposals={sampleProposals}
        isAnalyzing={false}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("calls createOrUpdate on accept", () => {
    const onAccept = vi.fn();
    render(
      <BatchProposalsPanel
        proposals={sampleProposals}
        isAnalyzing={false}
        onAccept={onAccept}
        onDismiss={vi.fn()}
      />
    );

    const acceptButtons = screen.getAllByLabelText("Accept rule");
    fireEvent.click(acceptButtons[0]!);

    expect(mockMutate).toHaveBeenCalledWith(
      {
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        tags: ["Groceries", "Essentials"],
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
  });

  it("calls onDismiss when dismiss button clicked", () => {
    const onDismiss = vi.fn();
    render(
      <BatchProposalsPanel
        proposals={sampleProposals}
        isAnalyzing={false}
        onAccept={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    const dismissButtons = screen.getAllByLabelText("Dismiss rule");
    fireEvent.click(dismissButtons[1]!);

    expect(onDismiss).toHaveBeenCalledWith("NETFLIX");
  });

  it("collapses and expands the panel", () => {
    render(
      <BatchProposalsPanel
        proposals={sampleProposals}
        isAnalyzing={false}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    // Initially expanded
    expect(screen.getByText("WOOLWORTHS")).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByText("AI-Suggested Rules"));
    expect(screen.queryByText("WOOLWORTHS")).not.toBeInTheDocument();

    // Expand again
    fireEvent.click(screen.getByText("AI-Suggested Rules"));
    expect(screen.getByText("WOOLWORTHS")).toBeInTheDocument();
  });
});
