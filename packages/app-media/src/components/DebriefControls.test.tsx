import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// Capture mutation options
let dismissOpts: Record<string, (...args: unknown[]) => unknown> = {};
const mockDismissMutate = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      comparisons: {
        dismissDebriefDimension: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            dismissOpts = opts;
            return { mutate: mockDismissMutate, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      media: {
        comparisons: {
          getPendingDebriefs: { invalidate: vi.fn() },
        },
      },
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  SkipDimensionButton,
  DoneForNowButton,
  CompletionSummary,
  DebriefActionBar,
} from "./DebriefControls";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("SkipDimensionButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dismissOpts = {};
  });

  it("renders skip button", () => {
    renderWithRouter(
      <SkipDimensionButton sessionId={1} dimensionId={2} dimensionName="Cinematography" />
    );
    expect(screen.getByTestId("skip-dimension-btn")).toBeInTheDocument();
    expect(screen.getByText("Skip this dimension")).toBeInTheDocument();
  });

  it("calls dismissDebriefDimension mutation on click", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <SkipDimensionButton sessionId={1} dimensionId={2} dimensionName="Cinematography" />
    );

    await user.click(screen.getByTestId("skip-dimension-btn"));
    expect(mockDismissMutate).toHaveBeenCalledWith({ sessionId: 1, dimensionId: 2 });
  });

  it("calls onSkipped callback on success", () => {
    const onSkipped = vi.fn();
    renderWithRouter(
      <SkipDimensionButton
        sessionId={1}
        dimensionId={2}
        dimensionName="Cinematography"
        onSkipped={onSkipped}
      />
    );

    // Simulate mutation success
    dismissOpts.onSuccess?.();
    expect(onSkipped).toHaveBeenCalled();
  });
});

describe("DoneForNowButton", () => {
  it("renders done for now button", () => {
    renderWithRouter(<DoneForNowButton />);
    expect(screen.getByTestId("done-for-now-btn")).toBeInTheDocument();
    expect(screen.getByText("Done for now")).toBeInTheDocument();
  });

  it("calls onExit callback when provided", async () => {
    const onExit = vi.fn();
    const user = userEvent.setup();
    renderWithRouter(<DoneForNowButton onExit={onExit} />);

    await user.click(screen.getByTestId("done-for-now-btn"));
    expect(onExit).toHaveBeenCalled();
  });
});

describe("CompletionSummary", () => {
  const summaryData = {
    sessionId: 1,
    movieTitle: "The Matrix",
    dimensions: [
      { dimensionId: 1, name: "Cinematography", status: "complete" as const, comparisonId: 10 },
      { dimensionId: 2, name: "Entertainment", status: "complete" as const, comparisonId: null },
      { dimensionId: 3, name: "Rewatchability", status: "pending" as const, comparisonId: null },
    ],
  };

  it("renders completion summary with movie title", () => {
    renderWithRouter(<CompletionSummary data={summaryData} />);
    expect(screen.getByTestId("completion-summary")).toBeInTheDocument();
    expect(screen.getByText("The Matrix")).toBeInTheDocument();
    expect(screen.getByText("Debrief Complete")).toBeInTheDocument();
  });

  it("shows compared and skipped counts", () => {
    renderWithRouter(<CompletionSummary data={summaryData} />);
    expect(screen.getByText("1 compared, 1 skipped")).toBeInTheDocument();
  });

  it("shows per-dimension results with badges", () => {
    renderWithRouter(<CompletionSummary data={summaryData} />);
    expect(screen.getByText("Cinematography")).toBeInTheDocument();
    expect(screen.getByText("Compared")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows Do Another button when callback provided", () => {
    const onDoAnother = vi.fn();
    renderWithRouter(<CompletionSummary data={summaryData} onDoAnother={onDoAnother} />);
    expect(screen.getByText("Do another")).toBeInTheDocument();
  });

  it("hides Do Another button when no callback", () => {
    renderWithRouter(<CompletionSummary data={summaryData} />);
    expect(screen.queryByText("Do another")).not.toBeInTheDocument();
  });
});

describe("DebriefActionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skip and bail buttons when session is active", () => {
    renderWithRouter(
      <DebriefActionBar
        sessionId={1}
        currentDimension={{ id: 2, name: "Cinematography" }}
        allComplete={false}
        summaryData={null}
      />
    );
    expect(screen.getByTestId("debrief-action-bar")).toBeInTheDocument();
    expect(screen.getByTestId("skip-dimension-btn")).toBeInTheDocument();
    expect(screen.getByTestId("done-for-now-btn")).toBeInTheDocument();
  });

  it("shows completion summary when all dimensions are complete", () => {
    const summaryData = {
      sessionId: 1,
      movieTitle: "The Matrix",
      dimensions: [
        { dimensionId: 1, name: "Cinematography", status: "complete" as const, comparisonId: 10 },
      ],
    };

    renderWithRouter(
      <DebriefActionBar
        sessionId={1}
        currentDimension={null}
        allComplete={true}
        summaryData={summaryData}
      />
    );
    expect(screen.getByTestId("completion-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("debrief-action-bar")).not.toBeInTheDocument();
  });

  it("hides skip button when no current dimension", () => {
    renderWithRouter(
      <DebriefActionBar
        sessionId={1}
        currentDimension={null}
        allComplete={false}
        summaryData={null}
      />
    );
    expect(screen.queryByTestId("skip-dimension-btn")).not.toBeInTheDocument();
    expect(screen.getByTestId("done-for-now-btn")).toBeInTheDocument();
  });
});
