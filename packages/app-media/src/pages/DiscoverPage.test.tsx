import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockTrendingQuery = vi.fn();
const mockRecommendationsQuery = vi.fn();
const mockProfileQuery = vi.fn();
const mockRewatchSuggestionsQuery = vi.fn();
const mockGenreSpotlightQuery = vi.fn();
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
        rewatchSuggestions: {
          useQuery: (...args: unknown[]) => mockRewatchSuggestionsQuery(...args),
        },
        genreSpotlight: {
          useQuery: (...args: unknown[]) => mockGenreSpotlightQuery(...args),
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
      watchHistory: {
        log: {
          useMutation: () => ({ mutateAsync: vi.fn() }),
        },
      },
    },
    useUtils: () => ({
      media: {
        discovery: {
          trending: { invalidate: vi.fn() },
          recommendations: { invalidate: vi.fn() },
          rewatchSuggestions: { invalidate: vi.fn() },
        },
        watchlist: { list: { invalidate: vi.fn() } },
      },
    }),
  },
}));

vi.mock("../components/HorizontalScrollRow", () => ({
  HorizontalScrollRow: ({
    title,
    subtitle,
    children,
  }: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {subtitle && <p data-testid="scroll-row-subtitle">{subtitle}</p>}
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

vi.mock("../components/PreferenceProfile", () => ({
  PreferenceProfile: () => <div data-testid="preference-profile" />,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { DiscoverPage } from "./DiscoverPage";

const trendingMovies = [
  {
    tmdbId: 100,
    title: "Dune",
    releaseDate: "2024-03-01",
    posterPath: null,
    posterUrl: null,
    voteAverage: 8.1,
    inLibrary: false,
  },
  {
    tmdbId: 200,
    title: "Oppenheimer",
    releaseDate: "2023-07-21",
    posterPath: null,
    posterUrl: null,
    voteAverage: 8.5,
    inLibrary: true,
  },
  {
    tmdbId: 300,
    title: "Barbie",
    releaseDate: "2023-07-21",
    posterPath: null,
    posterUrl: null,
    voteAverage: 7.0,
    inLibrary: false,
  },
];

const recommendedMovies = [
  {
    tmdbId: 400,
    title: "Blade Runner 2049",
    releaseDate: "2017-10-06",
    posterPath: null,
    posterUrl: null,
    voteAverage: 7.9,
    inLibrary: false,
    matchPercentage: 92,
    matchReason: "Sci-Fi, Action",
  },
  {
    tmdbId: 500,
    title: "Arrival",
    releaseDate: "2016-11-11",
    posterPath: null,
    posterUrl: null,
    voteAverage: 7.6,
    inLibrary: false,
    matchPercentage: 85,
    matchReason: "Sci-Fi",
  },
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

function defaultRewatchSuggestions() {
  mockRewatchSuggestionsQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    error: null,
  });
}

function defaultGenreSpotlight() {
  mockGenreSpotlightQuery.mockReturnValue({
    data: { genres: [] },
    isLoading: false,
    error: null,
  });
}

function setupDefaults() {
  defaultTrending();
  mockRecommendationsQuery.mockReturnValue(emptyRecommendations);
  defaultProfile(10);
  defaultRewatchSuggestions();
  defaultGenreSpotlight();
}

function renderPage(initialEntry = "/media/discover") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DiscoverPage />
    </MemoryRouter>
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
      expect.anything()
    );

    fireEvent.click(screen.getByText("Today"));

    expect(mockTrendingQuery).toHaveBeenCalledWith(
      expect.objectContaining({ timeWindow: "day" }),
      expect.anything()
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
      expect.anything()
    );
  });
});

describe("DiscoverPage — recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultTrending();
    defaultRewatchSuggestions();
    defaultGenreSpotlight();
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

    const links = screen.getAllByText("Start Comparing");
    const compareLink = links.find(
      (el) => el.closest("a")?.getAttribute("href") === "/media/compare"
    );
    expect(compareLink).toBeTruthy();
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

  it("shows attribution subtitle with source movies", () => {
    defaultProfile(10);
    defaultRecommendations();
    renderPage();

    const subtitles = screen.getAllByTestId("scroll-row-subtitle");
    const attributionText = subtitles.map((el) => el.textContent).join(" ");
    expect(attributionText).toContain("Based on Interstellar, The Matrix");
  });

  it("shows Owned badge and hides Add button for in-library recommendation", () => {
    defaultProfile(10);
    mockRecommendationsQuery.mockReturnValue({
      data: {
        results: [
          {
            tmdbId: 600,
            title: "Inception",
            releaseDate: "2010-07-16",
            posterPath: null,
            posterUrl: null,
            voteAverage: 8.4,
            inLibrary: true,
            matchPercentage: 90,
            matchReason: "Sci-Fi, Thriller",
          },
          {
            tmdbId: 700,
            title: "Tenet",
            releaseDate: "2020-08-26",
            posterPath: null,
            posterUrl: null,
            voteAverage: 7.3,
            inLibrary: false,
            matchPercentage: 78,
            matchReason: "Sci-Fi",
          },
        ],
        sourceMovies: ["Interstellar"],
      },
      isLoading: false,
      error: null,
    });
    renderPage();

    // Inception is in library — should show Owned, no Add button (appears in both sections)
    const inceptionCards = screen.getAllByTestId("card-600");
    expect(inceptionCards[0]!.textContent).toContain("Owned");
    expect(inceptionCards[0]!.querySelector("button")).toBeNull();

    // Tenet is not in library — should show Add button, no Owned
    const tenetCards = screen.getAllByTestId("card-700");
    expect(tenetCards[0]!.textContent).not.toContain("Owned");
    expect(tenetCards[0]!.querySelector("button")).toBeTruthy();
  });

  it("renders recommendation cards in matchPercentage order (composite score sorting)", () => {
    defaultProfile(10);
    const sortedMovies = [
      {
        tmdbId: 801,
        title: "Movie A",
        releaseDate: "2020-01-01",
        posterPath: null,
        posterUrl: null,
        voteAverage: 7.0,
        inLibrary: false,
        matchPercentage: 95,
        matchReason: "Action",
      },
      {
        tmdbId: 802,
        title: "Movie B",
        releaseDate: "2020-01-01",
        posterPath: null,
        posterUrl: null,
        voteAverage: 8.0,
        inLibrary: false,
        matchPercentage: 88,
        matchReason: "Drama",
      },
      {
        tmdbId: 803,
        title: "Movie C",
        releaseDate: "2020-01-01",
        posterPath: null,
        posterUrl: null,
        voteAverage: 9.0,
        inLibrary: false,
        matchPercentage: 72,
        matchReason: "Comedy",
      },
    ];
    mockRecommendationsQuery.mockReturnValue({
      data: { results: sortedMovies, sourceMovies: ["Top Gun"] },
      isLoading: false,
      error: null,
    });
    renderPage();

    // Both "Recommended for You" and "Similar to Top Rated" render same data
    // Check that within a section, cards appear in matchPercentage-descending order
    const allCards = screen.getAllByTestId(/^card-80/);
    // First 3 are from "Recommended for You", next 3 from "Similar to Top Rated"
    expect(allCards[0]!.getAttribute("data-testid")).toBe("card-801");
    expect(allCards[1]!.getAttribute("data-testid")).toBe("card-802");
    expect(allCards[2]!.getAttribute("data-testid")).toBe("card-803");

    // Verify match percentages are displayed
    expect(screen.getAllByText("95% Match").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("88% Match").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("72% Match").length).toBeGreaterThanOrEqual(1);
  });

  it("displays matchReason on recommendation cards", () => {
    defaultProfile(10);
    defaultRecommendations();
    renderPage();

    expect(screen.getAllByText("Sci-Fi, Action").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Sci-Fi").length).toBeGreaterThanOrEqual(1);
  });

  it("shows exact comparison count in cold start CTA", () => {
    defaultProfile(4);
    defaultRecommendations();
    renderPage();

    expect(screen.getByText(/you have 4 so far/)).toBeTruthy();
    expect(screen.getByText(/at least 5 comparisons/)).toBeTruthy();
  });

  it("hides cold start CTA at exactly the threshold (5 comparisons)", () => {
    defaultProfile(5);
    defaultRecommendations();
    renderPage();

    expect(screen.queryByText("Compare more movies to unlock recommendations")).toBeNull();
    expect(screen.getByText("Recommended for You")).toBeTruthy();
  });
});
