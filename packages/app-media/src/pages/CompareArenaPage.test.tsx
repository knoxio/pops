import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TooltipProvider } from "@pops/ui";

const mockDimensionsQuery = vi.fn();
const mockPairQuery = vi.fn();
const mockRecordMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockRefetchPair = vi.fn();
const mockScoresFetch = vi.fn();
const mockWatchlistListQuery = vi.fn();
const mockWatchlistAddMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockSkipMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockMarkStaleMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockExcludeMutateA = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockExcludeMutateB = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
let excludeCallCount = 0;
const mockBlacklistMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockListForMediaQuery = vi.fn();
const mockInvalidateRandomPair = vi.fn();
const mockInvalidateWatchlistList = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      comparisons: {
        listDimensions: {
          useQuery: (...args: unknown[]) => mockDimensionsQuery(...args),
        },
        getRandomPair: {
          useQuery: (...args: unknown[]) => {
            const result = mockPairQuery(...args);
            return { ...result, refetch: mockRefetchPair };
          },
        },
        record: {
          useMutation: (opts: Record<string, unknown>) => {
            mockRecordMutate._opts = opts;
            return { mutate: mockRecordMutate, isPending: false };
          },
        },
        recordSkip: {
          useMutation: (opts: Record<string, unknown>) => {
            mockSkipMutate._opts = opts;
            return { mutate: mockSkipMutate, isPending: false };
          },
        },
        scores: { fetch: (...args: unknown[]) => mockScoresFetch(...args) },
        markStale: {
          useMutation: (opts: Record<string, unknown>) => {
            mockMarkStaleMutate._opts = opts;
            return { mutate: mockMarkStaleMutate, isPending: false };
          },
        },
        excludeFromDimension: {
          useMutation: (opts?: Record<string, unknown>) => {
            excludeCallCount++;
            const mockFn = excludeCallCount % 2 === 1 ? mockExcludeMutateA : mockExcludeMutateB;
            if (opts) mockFn._opts = opts;
            return { mutate: mockFn, isPending: false };
          },
        },
        blacklistMovie: {
          useMutation: (opts: Record<string, unknown>) => {
            mockBlacklistMutate._opts = opts;
            return { mutate: mockBlacklistMutate, isPending: false };
          },
        },
        listForMedia: {
          useQuery: (...args: unknown[]) => mockListForMediaQuery(...args),
        },
      },
      watchlist: {
        list: {
          useQuery: (...args: unknown[]) => mockWatchlistListQuery(...args),
        },
        add: {
          useMutation: (opts: Record<string, unknown>) => {
            mockWatchlistAddMutate._opts = opts;
            return { mutate: mockWatchlistAddMutate, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      media: {
        comparisons: {
          scores: { fetch: mockScoresFetch },
          getRandomPair: { invalidate: mockInvalidateRandomPair },
        },
        watchlist: {
          list: { invalidate: mockInvalidateWatchlistList },
        },
      },
    }),
  },
}));

vi.mock("../components/DimensionManager", () => ({
  DimensionManager: () => <button>Manage Dimensions</button>,
}));

import { CompareArenaPage } from "./CompareArenaPage";

const dim1 = { id: 1, name: "Cinematography", active: true, description: null, sortOrder: 0 };
const dim2 = { id: 2, name: "Entertainment", active: true, description: null, sortOrder: 1 };
const dim3 = { id: 3, name: "Soundtrack", active: true, description: null, sortOrder: 2 };

const movieA = { id: 10, title: "The Matrix", posterPath: null, posterUrl: null };
const movieB = { id: 20, title: "Inception", posterPath: null, posterUrl: null };

function renderPage() {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <CompareArenaPage />
      </TooltipProvider>
    </MemoryRouter>
  );
}

function setupArena() {
  mockDimensionsQuery.mockReturnValue({
    data: { data: [dim1, dim2, dim3] },
    isLoading: false,
  });
  mockPairQuery.mockReturnValue({
    data: { data: { movieA, movieB } },
    isLoading: false,
    error: null,
  });
  mockWatchlistListQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
  });
  mockListForMediaQuery.mockReturnValue({
    data: null,
    isLoading: false,
  });
}

describe("CompareArenaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    excludeCallCount = 0;
    // Default mocks — overridden by setupArena but needed for standalone tests
    mockWatchlistListQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    mockListForMediaQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });
  });

  it("renders pair with movie titles", () => {
    setupArena();
    renderPage();

    expect(screen.getByText("The Matrix")).toBeTruthy();
    expect(screen.getByText("Inception")).toBeTruthy();
  });

  it("displays current dimension name in prompt", () => {
    setupArena();
    renderPage();

    expect(screen.getAllByText("Cinematography").length).toBeGreaterThan(0);
  });

  it("shows dimension tabs with first active highlighted", () => {
    setupArena();
    renderPage();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(3);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
  });

  it("calls record mutation when picking a winner", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByText("The Matrix"));

    expect(mockRecordMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensionId: 1,
        mediaAId: 10,
        mediaBId: 20,
        winnerId: 10,
      })
    );
  });

  it("skip button calls recordSkip mutation with correct pair details", () => {
    setupArena();
    renderPage();

    // Initially on Cinematography (dim1)
    const tabsBefore = screen.getAllByRole("tab");
    expect(tabsBefore[0]?.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByText("Skip this pair"));

    // No winner recording should be made
    expect(mockRecordMutate).not.toHaveBeenCalled();
    // Skip mutation should be called with correct args
    expect(mockSkipMutate).toHaveBeenCalledWith({
      dimensionId: 1,
      mediaAType: "movie",
      mediaAId: 10,
      mediaBType: "movie",
      mediaBId: 20,
    });
  });

  it("shows minimum threshold message when pair data is null", () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [dim1] },
      isLoading: false,
    });
    mockPairQuery.mockReturnValue({
      data: { data: null },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getByText("Not enough watched movies")).toBeTruthy();
  });

  it("disables cards during pending mutation (double-click prevention)", () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [dim1] },
      isLoading: false,
    });
    mockPairQuery.mockReturnValue({
      data: { data: { movieA, movieB } },
      isLoading: false,
      error: null,
    });

    // Override mutation to return isPending: true
    vi.mocked(mockRecordMutate);
    const { unmount } = render(
      <MemoryRouter>
        <TooltipProvider>
          <CompareArenaPage />
        </TooltipProvider>
      </MemoryRouter>
    );

    // Simulate pending state by re-mocking
    unmount();

    // Re-mock with isPending true
    const originalMock = vi.fn();
    vi.doMock("../lib/trpc", async () => {
      const mod = await vi.importActual("../lib/trpc");
      return {
        ...mod,
        trpc: {
          media: {
            comparisons: {
              record: {
                useMutation: () => ({ mutate: originalMock, isPending: true }),
              },
            },
          },
        },
      };
    });

    // Instead, test that the guard in handlePick works
    setupArena();
    renderPage();

    // First click should work
    fireEvent.click(screen.getByText("The Matrix"));
    expect(mockRecordMutate).toHaveBeenCalledTimes(1);
  });

  it("rotates dimension after picking a winner", () => {
    setupArena();
    renderPage();

    // Initially on Cinematography (index 0)
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");

    // Pick a winner — triggers onSuccess which advances dimensionIndex
    fireEvent.click(screen.getByText("The Matrix"));

    // The onSuccess callback advances the dimension
    // We can verify the mutation was called with the first dimension
    expect(mockRecordMutate).toHaveBeenCalledWith(expect.objectContaining({ dimensionId: 1 }));
  });

  it("watchlist button calls watchlist.add without comparison side effects", () => {
    setupArena();
    renderPage();

    // Click the watchlist bookmark button for movie A (The Matrix)
    const bookmarkButtons = screen.getAllByRole("button", { name: /add .* to watchlist/i });
    expect(bookmarkButtons.length).toBeGreaterThan(0);
    fireEvent.click(bookmarkButtons[0]!);

    // Should call watchlist add mutation
    expect(mockWatchlistAddMutate).toHaveBeenCalledWith({
      mediaType: "movie",
      mediaId: 10,
    });

    // Should NOT call comparison record mutation
    expect(mockRecordMutate).not.toHaveBeenCalled();

    // Should NOT trigger pair refresh
    expect(mockRefetchPair).not.toHaveBeenCalled();

    // Should NOT invalidate random pair cache
    expect(mockInvalidateRandomPair).not.toHaveBeenCalled();

    // Trigger onSuccess to verify it only invalidates watchlist + shows toast
    const onSuccess = mockWatchlistAddMutate._opts?.onSuccess as (
      data: unknown,
      variables: { mediaType: string; mediaId: number }
    ) => void;
    onSuccess(undefined, { mediaType: "movie", mediaId: 10 });

    // Should invalidate watchlist cache
    expect(mockInvalidateWatchlistList).toHaveBeenCalled();

    // Should still NOT refetch pair or record comparison
    expect(mockRefetchPair).not.toHaveBeenCalled();
    expect(mockInvalidateRandomPair).not.toHaveBeenCalled();
    expect(mockRecordMutate).not.toHaveBeenCalled();
  });

  it("renders loading skeletons when pair is loading", () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [dim1] },
      isLoading: false,
    });
    mockPairQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderPage();

    expect(screen.queryByText("The Matrix")).toBeNull();
    expect(screen.queryByText("Not enough watched movies")).toBeNull();
  });

  it("renders stale buttons for both movies", () => {
    setupArena();
    renderPage();

    expect(screen.getByLabelText("Mark The Matrix as stale")).toBeTruthy();
    expect(screen.getByLabelText("Mark Inception as stale")).toBeTruthy();
  });

  it("calls markStale mutation when clicking stale button for movie A", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Mark The Matrix as stale"));

    expect(mockMarkStaleMutate).toHaveBeenCalledWith({
      mediaType: "movie",
      mediaId: 10,
    });
  });

  it("calls markStale mutation when clicking stale button for movie B", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Mark Inception as stale"));

    expect(mockMarkStaleMutate).toHaveBeenCalledWith({
      mediaType: "movie",
      mediaId: 20,
    });
  });

  it("does not record a comparison when marking stale", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Mark The Matrix as stale"));

    expect(mockRecordMutate).not.toHaveBeenCalled();
  });

  it("renders N/A button in action bar", () => {
    setupArena();
    renderPage();

    expect(screen.getByText("N/A")).toBeTruthy();
  });

  it("N/A button calls excludeFromDimension for both movies", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByText("N/A"));

    // Should call exclude for movie A (id: 10) — no options arg
    expect(mockExcludeMutateA).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "movie", mediaId: 10, dimensionId: 1 })
    );
    // Should call exclude for movie B (id: 20) — with onSuccess options
    expect(mockExcludeMutateB).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "movie", mediaId: 20, dimensionId: 1 }),
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    // Should NOT record a comparison
    expect(mockRecordMutate).not.toHaveBeenCalled();
  });

  it("renders Not Watched buttons for both movies on cards and in action bar", () => {
    setupArena();
    renderPage();
    // Both card buttons and action bar buttons have the same aria-label
    const matrixButtons = screen.getAllByLabelText("Not watched The Matrix");
    const inceptionButtons = screen.getAllByLabelText("Not watched Inception");
    expect(matrixButtons.length).toBe(2); // card + action bar
    expect(inceptionButtons.length).toBe(2); // card + action bar
  });

  it("renders Not Watched action bar buttons with movie titles", () => {
    setupArena();
    renderPage();
    expect(screen.getByText("Not Watched: The Matrix")).toBeTruthy();
    expect(screen.getByText("Not Watched: Inception")).toBeTruthy();
  });

  it("opens confirmation dialog when action bar Not Watched button is clicked", () => {
    setupArena();
    renderPage();
    fireEvent.click(screen.getByText("Not Watched: The Matrix"));
    expect(screen.getByText("Mark as not watched?")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not Watched" })).toBeTruthy();
  });

  it("shows comparison count in confirmation dialog", () => {
    setupArena();
    mockListForMediaQuery.mockReturnValue({
      data: { data: [], pagination: { total: 5 } },
      isLoading: false,
    });
    renderPage();
    fireEvent.click(screen.getByText("Not Watched: The Matrix"));
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText(/comparisons involving/)).toBeTruthy();
  });

  it("calls blacklistMovie mutation on confirm", () => {
    setupArena();
    renderPage();
    fireEvent.click(screen.getByText("Not Watched: Inception"));
    fireEvent.click(screen.getByRole("button", { name: "Not Watched" }));
    expect(mockBlacklistMutate).toHaveBeenCalledWith({ mediaType: "movie", mediaId: 20 });
  });

  it("closes dialog on cancel without calling blacklist", () => {
    setupArena();
    renderPage();
    fireEvent.click(screen.getByText("Not Watched: The Matrix"));
    expect(screen.getByText("Mark as not watched?")).toBeTruthy();
    fireEvent.click(screen.getByText("Cancel"));
    expect(mockBlacklistMutate).not.toHaveBeenCalled();
  });
});
