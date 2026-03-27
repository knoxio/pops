import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

const mockWatchlistQuery = vi.fn();
const mockMoviesQuery = vi.fn();
const mockTvShowsQuery = vi.fn();
const mockRemoveMutate = vi.fn();
const mockReorderMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      watchlist: {
        list: { useQuery: (...args: unknown[]) => mockWatchlistQuery(...args) },
        remove: {
          useMutation: (opts: Record<string, unknown>) => {
            mockRemoveMutate._opts = opts;
            return { mutate: mockRemoveMutate, isPending: false };
          },
        },
        reorder: {
          useMutation: (opts: Record<string, unknown>) => {
            mockReorderMutate._opts = opts;
            return { mutate: mockReorderMutate, isPending: false };
          },
        },
        update: {
          useMutation: (opts: Record<string, unknown>) => {
            mockUpdateMutate._opts = opts;
            return { mutate: mockUpdateMutate, isPending: false, variables: null };
          },
        },
      },
      movies: {
        list: { useQuery: (...args: unknown[]) => mockMoviesQuery(...args) },
      },
      tvShows: {
        list: { useQuery: (...args: unknown[]) => mockTvShowsQuery(...args) },
      },
    },
    useUtils: () => ({
      media: {
        watchlist: { list: { invalidate: mockInvalidate } },
      },
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { WatchlistPage } from "./WatchlistPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <WatchlistPage />
    </MemoryRouter>
  );
}

const entry1 = {
  id: 1,
  mediaType: "movie",
  mediaId: 10,
  priority: 0,
  notes: null,
  addedAt: "2026-03-20T10:00:00Z",
};

const entry2 = {
  id: 2,
  mediaType: "tv_show",
  mediaId: 20,
  priority: 1,
  notes: "Great show",
  addedAt: "2026-03-19T10:00:00Z",
};

const entry3 = {
  id: 3,
  mediaType: "movie",
  mediaId: 30,
  priority: 2,
  notes: null,
  addedAt: "2026-03-18T10:00:00Z",
};

function setupMultipleEntries() {
  mockWatchlistQuery.mockReturnValue({
    data: { data: [entry1, entry2, entry3] },
    isLoading: false,
    error: null,
  });
  mockMoviesQuery.mockReturnValue({
    data: {
      data: [
        { id: 10, title: "The Matrix", releaseDate: "1999-03-31", posterUrl: null },
        { id: 30, title: "Inception", releaseDate: "2010-07-16", posterUrl: null },
      ],
    },
    isLoading: false,
  });
  mockTvShowsQuery.mockReturnValue({
    data: {
      data: [{ id: 20, name: "Breaking Bad", firstAirDate: "2008-01-20", posterUrl: null }],
    },
    isLoading: false,
  });
}

function setupSingleEntry() {
  mockWatchlistQuery.mockReturnValue({
    data: { data: [entry1] },
    isLoading: false,
    error: null,
  });
  mockMoviesQuery.mockReturnValue({
    data: {
      data: [{ id: 10, title: "The Matrix", releaseDate: "1999-03-31", posterUrl: null }],
    },
    isLoading: false,
  });
  mockTvShowsQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
  });
}

describe("WatchlistPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders watchlist entries with titles", () => {
    setupMultipleEntries();
    renderPage();

    expect(screen.getAllByText("The Matrix").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Breaking Bad").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inception").length).toBeGreaterThan(0);
  });

  it("renders grab handle on desktop cards for multiple items", () => {
    setupMultipleEntries();
    renderPage();

    const handles = screen.getAllByLabelText(/Drag to reorder/);
    expect(handles.length).toBeGreaterThan(0);
  });

  it("hides reorder controls for single-item list", () => {
    setupSingleEntry();
    renderPage();

    expect(screen.queryByLabelText(/Move .* up/)).toBeNull();
    expect(screen.queryByLabelText(/Move .* down/)).toBeNull();
    expect(screen.queryByLabelText(/Drag to reorder/)).toBeNull();
  });

  it("renders up/down buttons for mobile with multiple items", () => {
    setupMultipleEntries();
    renderPage();

    const upButtons = screen.getAllByLabelText(/Move .* up/);
    const downButtons = screen.getAllByLabelText(/Move .* down/);
    expect(upButtons.length).toBe(3);
    expect(downButtons.length).toBe(3);
  });

  it("disables up button on first item and down button on last item", () => {
    setupMultipleEntries();
    renderPage();

    const upButtons = screen.getAllByLabelText(/Move .* up/);
    const downButtons = screen.getAllByLabelText(/Move .* down/);

    // First item's up button should be disabled
    expect(upButtons[0]).toBeDisabled();
    // Last item's down button should be disabled
    expect(downButtons[downButtons.length - 1]).toBeDisabled();
  });

  it("renders empty state when watchlist is empty", () => {
    mockWatchlistQuery.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      error: null,
    });
    mockMoviesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    mockTvShowsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });

    renderPage();

    expect(screen.getByText(/Your watchlist is empty/)).toBeTruthy();
  });

  it("renders priority badges on desktop cards", () => {
    setupMultipleEntries();
    renderPage();

    expect(screen.getAllByText("#1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("#2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("#3").length).toBeGreaterThan(0);
  });

  describe("filter tabs", () => {
    it("renders All, Movies, TV Shows filter tabs", () => {
      setupMultipleEntries();
      renderPage();
      expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Movies" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "TV Shows" })).toBeInTheDocument();
    });

    it("All tab is selected by default", () => {
      setupMultipleEntries();
      renderPage();
      expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "Movies" })).toHaveAttribute("aria-selected", "false");
    });

    it("clicking Movies tab calls API with mediaType filter", async () => {
      setupMultipleEntries();
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole("tab", { name: "Movies" }));

      const calls = mockWatchlistQuery.mock.calls;
      const lastCall = calls[calls.length - 1]!;
      expect(lastCall[0]).toEqual(expect.objectContaining({ mediaType: "movie" }));
    });

    it("clicking TV Shows tab calls API with tv_show filter", async () => {
      setupMultipleEntries();
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole("tab", { name: "TV Shows" }));

      const calls = mockWatchlistQuery.mock.calls;
      const lastCall = calls[calls.length - 1]!;
      expect(lastCall[0]).toEqual(expect.objectContaining({ mediaType: "tv_show" }));
    });

    it("clicking All tab removes mediaType filter", async () => {
      setupMultipleEntries();
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole("tab", { name: "Movies" }));
      await user.click(screen.getByRole("tab", { name: "All" }));

      const calls = mockWatchlistQuery.mock.calls;
      const lastCall = calls[calls.length - 1]!;
      expect(lastCall[0]).not.toHaveProperty("mediaType");
    });

    it("shows filter-specific empty state for movies", async () => {
      setupMultipleEntries();
      const user = userEvent.setup();
      renderPage();

      mockWatchlistQuery.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      });

      await user.click(screen.getByRole("tab", { name: "Movies" }));

      expect(screen.getByText("No movies on your watchlist.")).toBeInTheDocument();
    });

    it("shows filter-specific empty state for TV shows", async () => {
      setupMultipleEntries();
      const user = userEvent.setup();
      renderPage();

      mockWatchlistQuery.mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      });

      await user.click(screen.getByRole("tab", { name: "TV Shows" }));

      expect(screen.getByText("No TV shows on your watchlist.")).toBeInTheDocument();
    });
  });
});
