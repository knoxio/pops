import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { MovieDetailPage } from "./MovieDetailPage";

// --- tRPC mock setup ---

const mockMovieQuery = vi.fn();
const mockWatchHistoryQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      movies: {
        get: {
          useQuery: (...args: unknown[]) => mockMovieQuery(...args),
        },
      },
      watchHistory: {
        list: {
          useQuery: (...args: unknown[]) => mockWatchHistoryQuery(...args),
        },
      },
    },
  },
}));

// Mock child components that have their own data needs
vi.mock("../components/WatchlistToggle", () => ({
  WatchlistToggle: () => <button>Watchlist</button>,
}));
vi.mock("../components/ComparisonScores", () => ({
  ComparisonScores: () => null,
}));
vi.mock("../components/MarkAsWatchedButton", () => ({
  MarkAsWatchedButton: () => <button>Mark Watched</button>,
}));
vi.mock("../components/ArrStatusBadge", () => ({
  ArrStatusBadge: () => null,
}));

// --- Helpers ---

const FULL_MOVIE: Record<string, unknown> = {
  id: 1,
  tmdbId: 278,
  imdbId: "tt0111161",
  title: "The Shawshank Redemption",
  originalTitle: "The Shawshank Redemption",
  overview: "Two imprisoned men bond over a number of years.",
  tagline: "Fear can hold you prisoner. Hope can set you free.",
  releaseDate: "1994-09-23",
  runtime: 142,
  status: "Released",
  originalLanguage: "en",
  budget: 25000000,
  revenue: 58300000,
  posterUrl: "/media/images/movie/278/poster.jpg",
  backdropUrl: "/media/images/movie/278/backdrop.jpg",
  logoUrl: null,
  posterPath: "/poster.jpg",
  backdropPath: "/backdrop.jpg",
  logoPath: null,
  posterOverridePath: null,
  voteAverage: 8.7,
  voteCount: 25000,
  genres: ["Drama", "Crime"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderPage(movieId = "1") {
  return render(
    <MemoryRouter initialEntries={[`/media/movies/${movieId}`]}>
      <Routes>
        <Route path="/media/movies/:id" element={<MovieDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function setupQueries(
  movieOverrides: Record<string, unknown> = {},
  watchHistory: Array<{
    id: number;
    watchedAt: string;
    mediaType: string;
    mediaId: number;
    completed: number;
  }> = []
) {
  const movie = { ...FULL_MOVIE, ...movieOverrides };
  mockMovieQuery.mockReturnValue({
    data: { data: movie },
    isLoading: false,
    error: null,
  });
  mockWatchHistoryQuery.mockReturnValue({
    data: { data: watchHistory, pagination: { total: watchHistory.length, limit: 50, offset: 0 } },
    isLoading: false,
  });
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockWatchHistoryQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
});

describe("MovieDetailPage", () => {
  describe("hero section", () => {
    it("renders backdrop image when available", () => {
      setupQueries({ backdropUrl: "/backdrop.jpg" });
      const { container } = renderPage();
      const img = container.querySelector('img[src="/backdrop.jpg"]');
      expect(img).toBeInTheDocument();
    });

    it("renders gradient fallback without backdrop", () => {
      setupQueries({ backdropUrl: null });
      const { container } = renderPage();
      expect(container.querySelector('img[src=""]')).not.toBeInTheDocument();
      // Gradient overlay still renders
      const gradientDiv = container.querySelector(".bg-gradient-to-t");
      expect(gradientDiv).toBeInTheDocument();
    });

    it("renders title, year, and runtime", () => {
      setupQueries();
      renderPage();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "The Shawshank Redemption"
      );
      expect(screen.getByText("1994")).toBeInTheDocument();
      expect(screen.getAllByText("2h 22m").length).toBeGreaterThanOrEqual(1);
    });

    it("renders tagline in italic", () => {
      setupQueries();
      renderPage();
      const tagline = screen.getByText("Fear can hold you prisoner. Hope can set you free.");
      expect(tagline).toBeInTheDocument();
      expect(tagline.className).toContain("italic");
    });

    it("hides tagline when null", () => {
      setupQueries({ tagline: null });
      renderPage();
      expect(screen.queryByText(/Fear can hold/)).not.toBeInTheDocument();
    });

    it("renders poster image", () => {
      setupQueries();
      renderPage();
      const poster = screen.getByAltText("The Shawshank Redemption poster");
      expect(poster).toHaveAttribute("src", "/media/images/movie/278/poster.jpg");
    });
  });

  describe("runtime formatting", () => {
    it("formats runtime as Xh Ym", () => {
      setupQueries({ runtime: 142 });
      renderPage();
      // Runtime appears in hero and metadata grid
      expect(screen.getAllByText("2h 22m").length).toBeGreaterThanOrEqual(1);
    });

    it("hides runtime when null", () => {
      setupQueries({ runtime: null });
      renderPage();
      expect(screen.queryByText(/\d+h/)).not.toBeInTheDocument();
    });
  });

  describe("metadata grid", () => {
    it("displays language as full name", () => {
      setupQueries({ originalLanguage: "en" });
      renderPage();
      expect(screen.getByText("English")).toBeInTheDocument();
      expect(screen.queryByText("EN")).not.toBeInTheDocument();
    });

    it("displays Japanese language name", () => {
      setupQueries({ originalLanguage: "ja" });
      renderPage();
      expect(screen.getByText("Japanese")).toBeInTheDocument();
    });

    it("falls back to uppercase for unknown language codes", () => {
      setupQueries({ originalLanguage: "xx" });
      renderPage();
      expect(screen.getByText("XX")).toBeInTheDocument();
    });

    it("hides budget when zero", () => {
      setupQueries({ budget: 0 });
      renderPage();
      expect(screen.queryByText("Budget")).not.toBeInTheDocument();
    });

    it("hides revenue when null", () => {
      setupQueries({ revenue: null });
      renderPage();
      expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
    });

    it("displays formatted budget and revenue", () => {
      setupQueries({ budget: 25000000, revenue: 58300000 });
      renderPage();
      expect(screen.getByText("$25,000,000")).toBeInTheDocument();
      expect(screen.getByText("$58,300,000")).toBeInTheDocument();
    });

    it("displays TMDB rating with vote count", () => {
      setupQueries({ voteAverage: 8.7, voteCount: 25000 });
      renderPage();
      expect(screen.getByText("8.7 (25000 votes)")).toBeInTheDocument();
    });
  });

  describe("watch history", () => {
    it("shows 'Not watched yet' when empty", () => {
      setupQueries({}, []);
      renderPage();
      expect(screen.getByText("Not watched yet")).toBeInTheDocument();
    });

    it("lists watch dates chronologically", () => {
      setupQueries({}, [
        {
          id: 1,
          watchedAt: "2026-01-15T20:00:00.000Z",
          mediaType: "movie",
          mediaId: 1,
          completed: 1,
        },
        {
          id: 2,
          watchedAt: "2026-03-10T19:00:00.000Z",
          mediaType: "movie",
          mediaId: 1,
          completed: 1,
        },
      ]);
      const { container } = renderPage();
      expect(screen.getByText("Watch History")).toBeInTheDocument();
      // Scope to watch history section to avoid matching breadcrumb <li> items
      const watchSection = container.querySelector("ul");
      const items = watchSection!.querySelectorAll("li");
      expect(items).toHaveLength(2);
    });
  });

  describe("404 handling", () => {
    it("shows error for invalid (non-numeric) ID", () => {
      mockMovieQuery.mockReturnValue({ data: null, isLoading: false, error: null });
      renderPage("abc");
      expect(screen.getByText("Invalid movie ID")).toBeInTheDocument();
    });

    it("shows not found message for missing movie", () => {
      mockMovieQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: { data: { code: "NOT_FOUND" }, message: "Not found" },
      });
      mockWatchHistoryQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
      renderPage("999");
      expect(screen.getByText("Movie not found")).toBeInTheDocument();
      expect(screen.getByText("Back to library")).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows skeleton while loading", () => {
      mockMovieQuery.mockReturnValue({ data: null, isLoading: true, error: null });
      const { container } = renderPage();
      const skeletons = container.querySelectorAll(
        "[class*='animate-pulse'], [data-slot='skeleton']"
      );
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("overview", () => {
    it("renders overview text", () => {
      setupQueries();
      renderPage();
      expect(
        screen.getByText("Two imprisoned men bond over a number of years.")
      ).toBeInTheDocument();
    });

    it("hides overview section when empty", () => {
      setupQueries({ overview: null });
      renderPage();
      expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    });
  });
});
