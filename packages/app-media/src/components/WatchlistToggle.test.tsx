import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WatchlistToggle } from "./WatchlistToggle";

// Capture mutation options so we can call onMutate/onError/onSettled directly
let addMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
let removeMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
const mockAddMutate = vi.fn();
const mockRemoveMutate = vi.fn();
const mockInvalidate = vi.fn();
const mockCancel = vi.fn().mockResolvedValue(undefined);
const mockGetData = vi.fn();
const mockSetData = vi.fn();

const mockListQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      watchlist: {
        list: {
          useQuery: (...args: unknown[]) => mockListQuery(...args),
        },
        add: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            addMutationOpts = opts;
            return { mutate: mockAddMutate, isPending: false };
          },
        },
        remove: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            removeMutationOpts = opts;
            return { mutate: mockRemoveMutate, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      media: {
        watchlist: {
          list: {
            invalidate: mockInvalidate,
            cancel: mockCancel,
            getData: mockGetData,
            setData: mockSetData,
          },
        },
      },
    }),
  },
}));

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

const PAGINATION_EMPTY = { total: 0, limit: 50, offset: 0, hasMore: false };
const PAGINATION_ONE = { total: 1, limit: 50, offset: 0, hasMore: false };

const WATCHLIST_ENTRY = {
  id: 42,
  mediaType: "movie",
  mediaId: 550,
  priority: null,
  notes: null,
  addedAt: "2026-01-01T00:00:00Z",
};

function setupNotOnWatchlist() {
  mockListQuery.mockReturnValue({
    data: { data: [], pagination: PAGINATION_EMPTY },
    isLoading: false,
  });
}

function setupOnWatchlist() {
  mockListQuery.mockReturnValue({
    data: { data: [WATCHLIST_ENTRY], pagination: PAGINATION_ONE },
    isLoading: false,
  });
}

function setupLoading() {
  mockListQuery.mockReturnValue({
    data: undefined,
    isLoading: true,
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  addMutationOpts = {};
  removeMutationOpts = {};
});

describe("WatchlistToggle", () => {
  describe("initial state", () => {
    it("shows loading button while checking watchlist", () => {
      setupLoading();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      expect(screen.getByLabelText("Checking watchlist status")).toBeInTheDocument();
    });

    it("shows 'Add to Watchlist' when not on watchlist", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      expect(screen.getByText("Add to Watchlist")).toBeInTheDocument();
      expect(screen.getByLabelText("Add to watchlist")).toBeInTheDocument();
    });

    it("shows 'On Watchlist' when on watchlist", () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      expect(screen.getByText("On Watchlist")).toBeInTheDocument();
      expect(screen.getByLabelText("Remove from watchlist")).toBeInTheDocument();
    });
  });

  describe("optimistic add", () => {
    it("calls addMutation.mutate on click when not on watchlist", async () => {
      setupNotOnWatchlist();
      const user = userEvent.setup();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      await user.click(screen.getByRole("button", { name: "Add to watchlist" }));

      expect(mockAddMutate).toHaveBeenCalledWith({ mediaType: "movie", mediaId: 550 });
    });

    it("onMutate cancels queries, snapshots cache, and adds optimistic entry", async () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previousData = { data: [], pagination: PAGINATION_EMPTY };
      mockGetData.mockReturnValue(previousData);

      const context = await addMutationOpts.onMutate!();

      expect(mockCancel).toHaveBeenCalled();
      expect(mockGetData).toHaveBeenCalledWith({ mediaType: "movie" });
      expect(mockSetData).toHaveBeenCalledWith(
        { mediaType: "movie" },
        expect.any(Function)
      );
      expect(context).toEqual({ previous: previousData });

      // Verify the updater function adds the optimistic entry
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updater = mockSetData.mock.calls[0]![1] as any;
      const result = updater({ data: [], pagination: PAGINATION_EMPTY });
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect((result.data[0] as { mediaId: number }).mediaId).toBe(550);
    });

    it("onSuccess shows success toast", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onSuccess!();

      expect(mockToastSuccess).toHaveBeenCalledWith("Added to watchlist");
    });

    it("onError rolls back cache and shows error toast", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previous = { data: [], pagination: PAGINATION_EMPTY };
      addMutationOpts.onError!(
        { message: "Server error", data: null },
        {},
        { previous }
      );

      expect(mockSetData).toHaveBeenCalledWith({ mediaType: "movie" }, previous);
      expect(mockToastError).toHaveBeenCalledWith("Failed to add: Server error");
    });

    it("onError shows info toast for CONFLICT (duplicate)", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onError!(
        { message: "Conflict", data: { code: "CONFLICT" } },
        {},
        { previous: { data: [], pagination: PAGINATION_EMPTY } }
      );

      expect(mockToastInfo).toHaveBeenCalledWith("Already on watchlist");
    });

    it("onSettled invalidates the query", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onSettled!();

      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  describe("optimistic remove", () => {
    it("calls removeMutation.mutate on click when on watchlist", async () => {
      setupOnWatchlist();
      const user = userEvent.setup();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      await user.click(screen.getByRole("button", { name: "Remove from watchlist" }));

      expect(mockRemoveMutate).toHaveBeenCalledWith({ id: 42 });
    });

    it("onMutate cancels queries, snapshots cache, and removes entry", async () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previousData = { data: [WATCHLIST_ENTRY], pagination: PAGINATION_ONE };
      mockGetData.mockReturnValue(previousData);

      const context = await removeMutationOpts.onMutate!();

      expect(mockCancel).toHaveBeenCalled();
      expect(context).toEqual({ previous: previousData });

      // Verify the updater function removes the entry
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updater = mockSetData.mock.calls[0]![1] as any;
      const result = updater({ data: [WATCHLIST_ENTRY], pagination: PAGINATION_ONE });
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it("onSuccess shows success toast", () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      removeMutationOpts.onSuccess!();

      expect(mockToastSuccess).toHaveBeenCalledWith("Removed from watchlist");
    });

    it("onError rolls back cache and shows error toast", () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previous = { data: [WATCHLIST_ENTRY], pagination: PAGINATION_ONE };
      removeMutationOpts.onError!(
        { message: "Network error" },
        {},
        { previous }
      );

      expect(mockSetData).toHaveBeenCalledWith({ mediaType: "movie" }, previous);
      expect(mockToastError).toHaveBeenCalledWith("Failed to remove: Network error");
    });

    it("onSettled invalidates the query", () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      removeMutationOpts.onSettled!();

      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  describe("media type conversion", () => {
    it("converts 'tv' to 'tv_show' for API calls", () => {
      mockListQuery.mockReturnValue({
        data: { data: [], pagination: PAGINATION_EMPTY },
        isLoading: false,
      });
      render(<WatchlistToggle mediaType="tv" mediaId={100} />);

      expect(mockListQuery).toHaveBeenCalledWith(
        { mediaType: "tv_show" },
        expect.any(Object)
      );
    });
  });
});
