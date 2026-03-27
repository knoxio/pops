import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockTrendingQuery = vi.fn();
const mockRecommendationsQuery = vi.fn();
const mockProfileQuery = vi.fn();
const mockAddMovieMutateAsync = vi.fn();
const mockAddWatchlistMutateAsync = vi.fn();
const mockTrendingRefetch = vi.fn();
const mockRecommendationsRefetch = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      discovery: {
        trending: {
          useQuery: (...args: unknown[]) => {
            const result = mockTrendingQuery(...args);
            return { ...result, refetch: mockTrendingRefetch, isFetching: false };
          },
        },
        recommendations: {
          useQuery: (...args: unknown[]) => {
            const result = mockRecommendationsQuery(...args);
            return { ...result, refetch: mockRecommendationsRefetch };
          },
        },
        profile: {
          useQuery: (...args: unknown[]) => mockProfileQuery(...args),
        },
      },
      library: {
        addMovie: {
          useMutation: () => ({ mutateAsync: mockAddMovieMutateAsync }),
        },
      },
      watchlist: {
        add: {
          useMutation: () => ({ mutateAsync: mockAddWatchlistMutateAsync }),
        },
        list: { invalidate: vi.fn() },
      },
    },
    useUtils: () => ({
      media: {
        discovery: {
          trending: { invalidate: vi.fn() },
          recommendations: { invalidate: vi.fn() },
        },
        watchlist: { list: { invalidate: vi.fn() } },
      },
    }),
  },
}));

vi.mock("../components/HorizontalScrollRow", () => ({
  HorizontalScrollRow: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  ),
}));

vi.mock("../components/DiscoverCard", () => ({
  DiscoverCard: ({
    title,
    inLibrary,
    onAddToLibrary,
    tmdbId,
    matchPercentage,
    matchReason,
  }: {
    title: string;
    inLibrary: boolean;
    onAddToLibrary?: (id: number) => void;
    tmdbId: number;
    matchPercentage?: number;
    matchReason?: string;
  }) => (
    <div data-testid={`card-${tmdbId}`}>
      <span>{title}</span>
      {inLibrary && <span>Owned</span>}
      {matchPercentage != null && <span>{matchPercentage}% Match</span>}
      {matchReason && <span>{matchReason}</span>}
      {!inLibrary && onAddToLibrary && (
        <button onClick={() => onAddToLibrary(tmdbId)}>Add to Library</button>
      )}
    </div>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { DiscoverPage } from "./DiscoverPage";

const trendingMovies = [
  { tmdbId: 100, title: "Dune", releaseDate: "2024-03-01", posterPath: null, posterUrl: null, voteAverage: 8.1, inLibrary: false },
  { tmdbId: 200, title: "Oppenheimer", releaseDate: "2023-07-21", posterPath: null, posterUrl: null, voteAverage: 8.5, inLibrary: true },
  { tmdbId: 300, title: "Barbie", releaseDate: "2023-07-21", posterPath: null, posterUrl: null, voteAverage: 7.0, inLibrary: false },
];

const recommendedMovies = [
  { tmdbId: 400, title: "Blade Runner 2049", releaseDate: "2017-10-06", posterPath: null, posterUrl: null, voteAverage: 7.9, inLibrary: false, matchPercentage: 92, matchReason: "Sci-Fi, Action" },
  { tmdbId: 500, title: "Arrival", releaseDate: "2016-11-11", posterPath: null, posterUrl: null, voteAverage: 7.6, inLibrary: false, matchPercentage: 85, matchReason: "Sci-Fi" },
];

const emptyRecommendations = {
  data: { results: [], sourceMovies: [] },
  isLoading: false,
  error: null,
};

function defaultTrending() {
  mockTrendingQuery.mockReturnValue({
    data: { results: trendingMovies, totalResults: 3, page: 1 },
    isLoading: false,
    error: null,
  });
}

function defaultRecommendations() {
  mockRecommendationsQuery.mockReturnValue({
    data: { results: recommendedMovies, sourceMovies: ["Interstellar", "The Matrix"] },
    isLoading: false,
    error: null,
  });
}

function defaultProfile(totalComparisons: number) {
  mockProfileQuery.mockReturnValue({
    data: {
      data: {
        totalComparisons,
        totalMoviesWatched: 10,
        genreAffinities: [],
        dimensionWeights: [],
        genreDistribution: [],
      },
    },
    isLoading: false,
  });
}

function setupDefaults() {
  defaultTrending();
  mockRecommendationsQuery.mockReturnValue(emptyRecommendations);
  defaultProfile(10);
}

function renderPage(initialEntry = "/media/discover") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DiscoverPage />
    </MemoryRouter>,
  );
}

describe("DiscoverPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders trending movies in grid", () => {
    setupDefaults();
    renderPage();

    expect(screen.getByText("Dune")).toBeTruthy();
    expect(screen.getByText("Oppenheimer")).toBeTruthy();
    expect(screen.getByText("Barbie")).toBeTruthy();
  });

  it("day/week toggle switches query timeWindow", () => {
    setupDefaults();
    renderPage();

    // Default is "week"
    expect(mockTrendingQuery).toHaveBeenCalledWith(
      expect.objectContaining({ timeWindow: "week" }),
      expect.anything(),
    );

    fireEvent.click(screen.getByText("Today"));

    expect(mockTrendingQuery).toHaveBeenCalledWith(
      expect.objectContaining({ timeWindow: "day" }),
      expect.anything(),
    );
  });

  it("active toggle button is highlighted", () => {
    setupDefaults();
    renderPage();

    const weekBtn = screen.getByText("This Week");
    const todayBtn = screen.getByText("Today");

    // Week is default — should have primary styles
    expect(weekBtn.className).toContain("bg-primary");
    expect(todayBtn.className).toContain("bg-muted");

    fireEvent.click(todayBtn);

    expect(todayBtn.className).toContain("bg-primary");
    expect(weekBtn.className).toContain("bg-muted");
  });

  it("calls add to library mutation with tmdbId", () => {
    setupDefaults();
    mockAddMovieMutateAsync.mockResolvedValue({
      created: true,
      data: { id: 1, title: "Dune" },
    });
    renderPage();

    fireEvent.click(screen.getAllByText("Add to Library")[0]!);

    expect(mockAddMovieMutateAsync).toHaveBeenCalledWith({ tmdbId: 100 });
  });

  it("shows Owned badge for movies already in library", () => {
    setupDefaults();
    renderPage();

    // Oppenheimer (tmdbId 200) is inLibrary
    const card = screen.getByTestId("card-200");
    expect(card.textContent).toContain("Owned");
  });

  it("shows error state with retry button", () => {
    defaultProfile(10);
    defaultRecommendations();
    mockTrendingQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: "TMDB API error" },
    });
    renderPage();

    expect(screen.getByText("TMDB API error")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(mockTrendingRefetch).toHaveBeenCalled();
  });

  it("shows Load More button when more results available", () => {
    defaultProfile(10);
    mockRecommendationsQuery.mockReturnValue(emptyRecommendations);
    mockTrendingQuery.mockReturnValue({
      data: { results: trendingMovies, totalResults: 60, page: 1 },
      isLoading: false,
      error: null,
    });
    renderPage();

    expect(screen.getByText("Load More")).toBeTruthy();
  });

  it("reads time window from URL query param", () => {
    setupDefaults();
    renderPage("/media/discover?window=day");

    expect(mockTrendingQuery).toHaveBeenCalledWith(
      expect.objectContaining({ timeWindow: "day" }),
      expect.anything(),
    );
  });
});

describe("DiscoverPage — recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultTrending();
  });

  it("shows cold start CTA when totalComparisons < 5", () => {
    defaultProfile(2);
    defaultRecommendations();
    renderPage();

    expect(screen.getByText("Compare more movies to unlock recommendations")).toBeTruthy();
    expect(screen.getByText(/you have 2 so far/)).toBeTruthy();
    expect(screen.queryByText("Recommended for You")).toBeNull();
  });

  it("CTA links to /media/compare", () => {
    defaultProfile(0);
    defaultRecommendations();
    renderPage();

    const link = screen.getByText("Start Comparing");
    expect(link.closest("a")?.getAttribute("href")).toBe("/media/compare");
  });

  it("renders recommendations with attribution when above threshold", () => {
    defaultProfile(10);
    defaultRecommendations();
    renderPage();

    expect(screen.getByText("Recommended for You")).toBeTruthy();
    expect(screen.getAllByText("Blade Runner 2049").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("92% Match").length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'no new recommendations' when results empty but above threshold", () => {
    defaultProfile(10);
    mockRecommendationsQuery.mockReturnValue({
      data: { results: [], sourceMovies: [] },
      isLoading: false,
      error: null,
    });
    renderPage();

    expect(screen.getByText(/No new recommendations/)).toBeTruthy();
  });

  it("calls add to library on recommendation card", () => {
    defaultProfile(10);
    defaultRecommendations();
    mockAddMovieMutateAsync.mockResolvedValue({
      created: true,
      data: { id: 1, title: "Blade Runner 2049" },
    });
    renderPage();

    const addButtons = screen.getAllByText("Add to Library");
    fireEvent.click(addButtons[addButtons.length - 2]!);

    expect(mockAddMovieMutateAsync).toHaveBeenCalledWith({ tmdbId: 400 });
  });
});
