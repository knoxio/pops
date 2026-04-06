import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ComparisonHistoryPage } from "./ComparisonHistoryPage";

// Mock sonner
const mockToast = vi.fn().mockReturnValue("toast-id-1");
const mockToastDismiss = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => mockToast(...args), {
    dismiss: (...args: unknown[]) => mockToastDismiss(...args),
  }),
}));

// Mock trpc
const mockListAllQuery = vi.fn();
const mockDimensionsQuery = vi.fn();
const mockMovieGetQuery = vi.fn();
const mockDeleteMutate = vi.fn();
const mockInvalidateListAll = vi.fn();
const mockInvalidateScores = vi.fn();
const mockInvalidateRankings = vi.fn();
const mockRefetch = vi.fn();
let deleteMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      comparisons: {
        listAll: {
          useQuery: (...args: unknown[]) => mockListAllQuery(...args),
        },
        listDimensions: {
          useQuery: (...args: unknown[]) => mockDimensionsQuery(...args),
        },
        delete: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            deleteMutationOpts = opts;
            return { mutate: mockDeleteMutate, isPending: false };
          },
        },
      },
      movies: {
        get: {
          useQuery: (...args: unknown[]) => mockMovieGetQuery(...args),
        },
      },
    },
    useUtils: () => ({
      media: {
        comparisons: {
          listAll: { invalidate: mockInvalidateListAll },
          scores: { invalidate: mockInvalidateScores },
          rankings: { invalidate: mockInvalidateRankings },
        },
      },
    }),
  },
}));

const DIMENSION = { id: 1, name: "Overall" };
const COMPARISON = {
  id: 10,
  dimensionId: 1,
  mediaAType: "movie",
  mediaAId: 100,
  mediaBType: "movie",
  mediaBId: 200,
  winnerType: "movie",
  winnerId: 100,
  comparedAt: "2026-01-15T12:00:00Z",
};

function setupLoaded(comparisons = [COMPARISON], total = comparisons.length) {
  mockDimensionsQuery.mockReturnValue({ data: { data: [DIMENSION] } });
  mockListAllQuery.mockReturnValue({
    data: { data: comparisons, pagination: { total, limit: 20, offset: 0 } },
    isLoading: false,
    refetch: mockRefetch,
  });
  mockMovieGetQuery.mockImplementation(({ id }: { id: number }) => ({
    data: { data: { title: `Movie ${id}` } },
  }));
}

function setupEmpty() {
  mockDimensionsQuery.mockReturnValue({ data: { data: [DIMENSION] } });
  mockListAllQuery.mockReturnValue({
    data: { data: [], pagination: { total: 0, limit: 20, offset: 0 } },
    isLoading: false,
    refetch: mockRefetch,
  });
}

function setupLoading() {
  mockDimensionsQuery.mockReturnValue({ data: undefined });
  mockListAllQuery.mockReturnValue({ data: undefined, isLoading: true, refetch: mockRefetch });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ComparisonHistoryPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ComparisonHistoryPage", () => {
  it("shows history list with comparison rows", () => {
    setupLoaded();
    renderPage();

    expect(screen.getByText("Comparison History")).toBeInTheDocument();
    expect(screen.getByText("Movie 100")).toBeInTheDocument();
    expect(screen.getByText("beat")).toBeInTheDocument();
    expect(screen.getByText("Movie 200")).toBeInTheDocument();
    expect(screen.getAllByText("Overall").length).toBeGreaterThan(0);
  });

  it("shows empty state when no comparisons", () => {
    setupEmpty();
    renderPage();

    expect(screen.getByText(/No comparisons yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Compare Arena" })).toBeInTheDocument();
  });

  it("shows skeletons while loading", () => {
    setupLoading();
    const { container } = renderPage();

    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows undo toast on delete without immediately deleting", () => {
    setupLoaded();
    renderPage();

    const deleteBtn = screen.getByRole("button", { name: "" });
    fireEvent.click(deleteBtn);

    expect(mockToast).toHaveBeenCalledWith(
      "Comparison deleted",
      expect.objectContaining({ duration: 5000 })
    );
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it("executes delete after 5-second window", () => {
    setupLoaded();
    renderPage();

    const deleteBtn = screen.getByRole("button", { name: "" });
    fireEvent.click(deleteBtn);

    expect(mockDeleteMutate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: COMPARISON.id });
  });

  it("cancels delete when undo is clicked", () => {
    setupLoaded();
    renderPage();

    const deleteBtn = screen.getByRole("button", { name: "" });
    fireEvent.click(deleteBtn);

    // Simulate clicking undo via the action callback
    const toastCall = mockToast.mock.calls[0];
    const opts = toastCall?.[1] as { action?: { onClick: () => void } };
    opts?.action?.onClick();

    vi.advanceTimersByTime(5000);
    expect(mockDeleteMutate).not.toHaveBeenCalled();
    expect(mockToastDismiss).toHaveBeenCalledWith("toast-id-1");
  });

  it("invalidates queries on successful delete", () => {
    setupLoaded();
    renderPage();

    // Trigger the onSuccess callback directly
    deleteMutationOpts.onSuccess?.();

    expect(mockInvalidateListAll).toHaveBeenCalled();
    expect(mockInvalidateScores).toHaveBeenCalled();
    expect(mockInvalidateRankings).toHaveBeenCalled();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("filters by dimension", () => {
    setupLoaded();
    renderPage();

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "1" } });

    expect(mockListAllQuery).toHaveBeenLastCalledWith(expect.objectContaining({ dimensionId: 1 }));
  });

  it("shows pagination when multiple pages exist", () => {
    setupLoaded([COMPARISON], 50);
    renderPage();

    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();
  });

  it("renders search input", () => {
    setupLoaded();
    renderPage();

    expect(screen.getByPlaceholderText("Search by movie title…")).toBeInTheDocument();
  });

  it("typing in search triggers filtered query after debounce", () => {
    setupLoaded();
    renderPage();

    const searchInput = screen.getByPlaceholderText("Search by movie title…");
    fireEvent.change(searchInput, { target: { value: "Dark" } });

    // Before debounce fires: no search param
    expect(mockListAllQuery).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "Dark" })
    );

    // Fire debounce timer and flush React state updates
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mockListAllQuery).toHaveBeenLastCalledWith(expect.objectContaining({ search: "Dark" }));
  });

  it("empty search does not pass search param to query", () => {
    setupLoaded();
    renderPage();

    const searchInput = screen.getByPlaceholderText("Search by movie title…");
    fireEvent.change(searchInput, { target: { value: "   " } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockListAllQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: undefined })
    );
  });
});
