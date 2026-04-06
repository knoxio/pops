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
        getSmartPair: {
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
          getSmartPair: { invalidate: mockInvalidateRandomPair },
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
    data: { data: { movieA, movieB, dimensionId: 1 } },
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

    expect(screen.getAllByText("The Matrix").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inception").length).toBeGreaterThan(0);
  });

  it("renders dimension dropdown with active dimension selected", () => {
    setupArena();
    renderPage();

    const select = screen.getByLabelText("Comparison dimension");
    expect(select).toBeTruthy();
    expect((select as HTMLSelectElement).value).toBe("1");
  });

  it("calls record mutation when picking a winner", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getAllByText("The Matrix")[0]!);

    expect(mockRecordMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensionId: 1,
        mediaAId: 10,
        mediaBId: 20,
        winnerId: 10,
      })
    );
  });

  it("skip button calls recordSkip mutation", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Skip this pair"));

    expect(mockRecordMutate).not.toHaveBeenCalled();
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
    mockWatchlistListQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText("Not enough watched movies")).toBeTruthy();
  });

  it("shows watchlist depletion message when pool is empty and movies are watchlisted", () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [dim1] },
      isLoading: false,
    });
    mockPairQuery.mockReturnValue({
      data: { data: null },
      isLoading: false,
      error: null,
    });
    mockWatchlistListQuery.mockReturnValue({
      data: {
        data: [
          { id: 1, mediaType: "movie", mediaId: 10, title: "The Matrix", addedAt: "2026-01-01" },
        ],
      },
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText("Not enough movies")).toBeTruthy();
    expect(screen.getByText("Some are on your watchlist.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View watchlist" })).toBeTruthy();
  });

  it("disables cards during pending mutation", () => {
    setupArena();
    const { unmount } = renderPage();

    unmount();

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

    setupArena();
    renderPage();

    fireEvent.click(screen.getAllByText("The Matrix")[0]!);
    expect(mockRecordMutate).toHaveBeenCalledTimes(1);
  });

  it("calls record mutation with correct dimension", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getAllByText("The Matrix")[0]!);

    expect(mockRecordMutate).toHaveBeenCalledWith(expect.objectContaining({ dimensionId: 1 }));
  });

  it("watchlist button calls watchlist.add without comparison side effects", () => {
    setupArena();
    renderPage();

    const bookmarkButtons = screen.getAllByRole("button", { name: /add .* to watchlist/i });
    expect(bookmarkButtons.length).toBeGreaterThan(0);
    fireEvent.click(bookmarkButtons[0]!);

    expect(mockWatchlistAddMutate).toHaveBeenCalledWith({
      mediaType: "movie",
      mediaId: 10,
    });

    expect(mockRecordMutate).not.toHaveBeenCalled();
    expect(mockRefetchPair).not.toHaveBeenCalled();
    expect(mockInvalidateRandomPair).not.toHaveBeenCalled();

    const onSuccess = mockWatchlistAddMutate._opts?.onSuccess as (
      data: unknown,
      variables: { mediaType: string; mediaId: number }
    ) => void;
    onSuccess(undefined, { mediaType: "movie", mediaId: 10 });

    expect(mockInvalidateWatchlistList).toHaveBeenCalled();
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

  it("N/A button calls excludeFromDimension for both movies", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText(/Exclude both from/));

    expect(mockExcludeMutateA).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "movie", mediaId: 10, dimensionId: 1 })
    );
    expect(mockExcludeMutateB).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "movie", mediaId: 20, dimensionId: 1 }),
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(mockRecordMutate).not.toHaveBeenCalled();
  });

  it("renders Not Watched buttons on both cards", () => {
    setupArena();
    renderPage();

    expect(screen.getByLabelText("Not watched The Matrix")).toBeTruthy();
    expect(screen.getByLabelText("Not watched Inception")).toBeTruthy();
  });

  it("opens confirmation dialog when Not Watched button is clicked", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Not watched The Matrix"));

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

    fireEvent.click(screen.getByLabelText("Not watched The Matrix"));

    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText(/comparisons involving/)).toBeTruthy();
  });

  it("calls blacklistMovie mutation on confirm", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Not watched Inception"));
    fireEvent.click(screen.getByRole("button", { name: "Not Watched" }));

    expect(mockBlacklistMutate).toHaveBeenCalledWith({ mediaType: "movie", mediaId: 20 });
  });

  it("closes dialog on cancel without calling blacklist", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Not watched The Matrix"));
    expect(screen.getByText("Mark as not watched?")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));
    expect(mockBlacklistMutate).not.toHaveBeenCalled();
  });

  it("renders draw tier buttons with tooltips", () => {
    setupArena();
    renderPage();

    expect(screen.getByLabelText("Equally great")).toBeTruthy();
    expect(screen.getByLabelText("Equally average")).toBeTruthy();
    expect(screen.getByLabelText("Equally poor")).toBeTruthy();
  });

  it("draw high button records comparison with drawTier high", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Equally great"));

    expect(mockRecordMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensionId: 1,
        mediaAId: 10,
        mediaBId: 20,
        winnerId: 0,
        drawTier: "high",
      })
    );
  });

  it("draw mid button records comparison with drawTier mid", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Equally average"));

    expect(mockRecordMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        winnerId: 0,
        drawTier: "mid",
      })
    );
  });

  it("draw low button records comparison with drawTier low", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Equally poor"));

    expect(mockRecordMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        winnerId: 0,
        drawTier: "low",
      })
    );
  });

  it("draw buttons do not record a winner", () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText("Equally great"));

    expect(mockRecordMutate).toHaveBeenCalledTimes(1);
    expect(mockRecordMutate).toHaveBeenCalledWith(expect.objectContaining({ winnerId: 0 }));
  });

  it("renders history link in header", () => {
    setupArena();
    renderPage();

    expect(screen.getByLabelText("Comparison history")).toBeTruthy();
  });
});
