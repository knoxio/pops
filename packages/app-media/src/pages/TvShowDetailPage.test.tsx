import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { TvShowDetailPage } from "./TvShowDetailPage";

// --- tRPC mock setup ---

const { mockShowQuery, mockSeasonsQuery, mockProgressQuery, mockBatchLogMutation, mockInvalidate } =
  vi.hoisted(() => ({
    mockShowQuery: vi.fn(),
    mockSeasonsQuery: vi.fn(),
    mockProgressQuery: vi.fn(),
    mockBatchLogMutation: vi.fn(),
    mockInvalidate: vi.fn(),
  }));

vi.mock("../lib/trpc", () => ({
  trpc: {
    media: {
      tvShows: {
        get: {
          useQuery: (...args: unknown[]) => mockShowQuery(...args),
        },
        listSeasons: {
          useQuery: (...args: unknown[]) => mockSeasonsQuery(...args),
        },
      },
      watchHistory: {
        progress: {
          useQuery: (...args: unknown[]) => mockProgressQuery(...args),
        },
        batchLog: {
          useMutation: (opts: Record<string, unknown>) => {
            mockBatchLogMutation.mockImplementation(() => {
              if (typeof opts.onSuccess === "function") (opts.onSuccess as () => void)();
            });
            return { mutate: mockBatchLogMutation, isPending: false };
          },
        },
        invalidate: mockInvalidate,
      },
    },
    useUtils: () => ({
      media: {
        watchHistory: {
          invalidate: mockInvalidate,
        },
      },
    }),
  },
}));

vi.mock("../components/ArrStatusBadge", () => ({
  ArrStatusBadge: () => null,
}));

// --- Test data ---

const SHOW = {
  id: 1,
  tvdbId: 81189,
  name: "Breaking Bad",
  overview: "A chemistry teacher turned meth cook.",
  firstAirDate: "2008-01-20",
  lastAirDate: "2013-09-29",
  status: "Ended",
  originalLanguage: "en",
  posterUrl: "/media/images/tv/81189/poster.jpg",
  backdropUrl: "/media/images/tv/81189/backdrop.jpg",
  voteAverage: 9.5,
  voteCount: 10000,
  genres: ["Drama", "Crime"],
  networks: ["AMC"],
};

const SEASONS = [
  { id: 10, seasonNumber: 0, name: "Specials", episodeCount: 3 },
  { id: 11, seasonNumber: 1, name: "Season 1", episodeCount: 7 },
  { id: 12, seasonNumber: 2, name: "Season 2", episodeCount: 13 },
  { id: 13, seasonNumber: 3, name: null, episodeCount: 13 },
];

const PROGRESS = {
  tvShowId: 1,
  overall: { watched: 20, total: 36, percentage: 56 },
  seasons: [
    { seasonId: 10, seasonNumber: 0, watched: 0, total: 3, percentage: 0 },
    { seasonId: 11, seasonNumber: 1, watched: 7, total: 7, percentage: 100 },
    { seasonId: 12, seasonNumber: 2, watched: 8, total: 13, percentage: 62 },
    { seasonId: 13, seasonNumber: 3, watched: 5, total: 13, percentage: 38 },
  ],
  nextEpisode: null,
};

// --- Helpers ---

function renderPage(showId = "1") {
  return render(
    <MemoryRouter initialEntries={[`/media/tv/${showId}`]}>
      <Routes>
        <Route path="/media/tv/:id" element={<TvShowDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function setupQueries(
  showOverrides: Record<string, unknown> = {},
  seasons = SEASONS,
  progress = PROGRESS
) {
  mockShowQuery.mockReturnValue({
    data: { data: { ...SHOW, ...showOverrides } },
    isLoading: false,
    error: null,
  });
  mockSeasonsQuery.mockReturnValue({
    data: { data: seasons },
    isLoading: false,
  });
  mockProgressQuery.mockReturnValue({
    data: { data: progress },
    isLoading: false,
  });
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockSeasonsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
  mockProgressQuery.mockReturnValue({ data: null, isLoading: false });
});

describe("TvShowDetailPage — season list", () => {
  describe("rendering", () => {
    it("renders season cards with correct data", () => {
      setupQueries();
      renderPage();
      expect(screen.getByRole("heading", { name: "Seasons" })).toBeInTheDocument();
      expect(screen.getByText("Season 1")).toBeInTheDocument();
      expect(screen.getByText("Season 2")).toBeInTheDocument();
      // Season 3 has null name — falls back to "Season 3"
      expect(screen.getByText("Season 3")).toBeInTheDocument();
      expect(screen.getByText("Specials")).toBeInTheDocument();
    });

    it("renders episode counts", () => {
      setupQueries();
      renderPage();
      expect(screen.getByText("7 episodes")).toBeInTheDocument();
      expect(screen.getAllByText("13 episodes")).toHaveLength(2);
      expect(screen.getByText("3 episodes")).toBeInTheDocument();
    });

    it("shows empty state when no seasons", () => {
      setupQueries({}, [], {
        ...PROGRESS,
        overall: { watched: 0, total: 0, percentage: 0 },
        seasons: [],
      });
      renderPage();
      expect(screen.getByRole("heading", { name: "Seasons" })).toBeInTheDocument();
      expect(screen.getByText("No seasons available")).toBeInTheDocument();
    });
  });

  describe("sort order", () => {
    it("puts specials (season 0) last", () => {
      setupQueries();
      const { container } = renderPage();
      const links = container.querySelectorAll('a[href*="/season/"]');
      expect(links).toHaveLength(4);
      // First three should be seasons 1, 2, 3 — last should be specials (season 0)
      expect(links[0]!.getAttribute("href")).toBe("/media/tv/1/season/1");
      expect(links[1]!.getAttribute("href")).toBe("/media/tv/1/season/2");
      expect(links[2]!.getAttribute("href")).toBe("/media/tv/1/season/3");
      expect(links[3]!.getAttribute("href")).toBe("/media/tv/1/season/0");
    });
  });

  describe("navigation", () => {
    it("links to correct season detail page", () => {
      setupQueries();
      const { container } = renderPage();
      const seasonLink = container.querySelector('a[href="/media/tv/1/season/2"]');
      expect(seasonLink).toBeInTheDocument();
    });
  });

  describe("progress bars", () => {
    it("renders progress bar for season with progress", () => {
      setupQueries();
      const { container } = renderPage();
      // Season 1 is 100% — should have green bar
      const progressBars = container.querySelectorAll("[style*='width']");
      expect(progressBars.length).toBeGreaterThan(0);
    });

    it("renders green bar for completed season (100%)", () => {
      setupQueries({}, [{ id: 11, seasonNumber: 1, name: "Season 1", episodeCount: 7 }], {
        ...PROGRESS,
        seasons: [{ seasonId: 11, seasonNumber: 1, watched: 7, total: 7, percentage: 100 }],
      });
      const { container } = renderPage();
      const bar = container.querySelector("[style*='width: 100%']");
      expect(bar).toBeInTheDocument();
      expect(bar?.className).toContain("bg-green-500");
    });

    it("renders accent bar for in-progress season (50%)", () => {
      setupQueries({}, [{ id: 12, seasonNumber: 2, name: "Season 2", episodeCount: 10 }], {
        ...PROGRESS,
        seasons: [{ seasonId: 12, seasonNumber: 2, watched: 5, total: 10, percentage: 50 }],
      });
      const { container } = renderPage();
      const bar = container.querySelector("[style*='width: 50%']");
      expect(bar).toBeInTheDocument();
      expect(bar?.className).toContain("bg-primary");
    });

    it("does not render progress bar for 0% season", () => {
      setupQueries({}, [{ id: 10, seasonNumber: 1, name: "Season 1", episodeCount: 5 }], {
        ...PROGRESS,
        overall: { watched: 0, total: 5, percentage: 0 },
        seasons: [{ seasonId: 10, seasonNumber: 1, watched: 0, total: 5, percentage: 0 }],
      });
      const { container } = renderPage();
      // ProgressBar renders a 0-width bar (width: 0%) — the bar div still exists but is invisible
      const seasonLinks = container.querySelectorAll('a[href*="/season/"]');
      expect(seasonLinks).toHaveLength(1);
      const bar = seasonLinks[0]!.querySelector("[style*='width: 0%']");
      expect(bar).toBeInTheDocument();
    });
  });

  describe("404 handling", () => {
    it("shows error for invalid show ID", () => {
      mockShowQuery.mockReturnValue({ data: null, isLoading: false, error: null });
      renderPage("abc");
      expect(screen.getByText("Invalid show ID")).toBeInTheDocument();
    });

    it("shows not found for missing show", () => {
      mockShowQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: { data: { code: "NOT_FOUND" }, message: "Not found" },
      });
      renderPage("999");
      expect(screen.getByText("Show not found")).toBeInTheDocument();
    });
  });
});

describe("TvShowDetailPage — hero and metadata", () => {
  describe("hero with backdrop", () => {
    it("renders backdrop image when backdropUrl is present", () => {
      setupQueries();
      const { container } = renderPage();
      const backdrop = container.querySelector('img[src="/media/images/tv/81189/backdrop.jpg"]');
      expect(backdrop).toBeInTheDocument();
    });

    it("renders poster image", () => {
      setupQueries();
      renderPage();
      expect(screen.getByAltText("Breaking Bad poster")).toBeInTheDocument();
    });

    it("renders title in h1", () => {
      setupQueries();
      renderPage();
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("Breaking Bad");
    });
  });

  describe("year range formatting", () => {
    it("shows start–end for ended show spanning multiple years", () => {
      setupQueries();
      renderPage();
      expect(screen.getByText("2008–2013")).toBeInTheDocument();
    });

    it("shows year–Present for returning series", () => {
      setupQueries({
        status: "Returning Series",
        firstAirDate: "2022-02-18",
        lastAirDate: "2024-01-12",
      });
      renderPage();
      expect(screen.getByText("2022–Present")).toBeInTheDocument();
    });

    it("shows single year when start and end are in same year", () => {
      setupQueries({
        firstAirDate: "2020-06-01",
        lastAirDate: "2020-12-15",
        status: "Ended",
      });
      renderPage();
      expect(screen.getByText("2020")).toBeInTheDocument();
    });
  });

  describe("networks display", () => {
    it("renders networks in metadata grid", () => {
      setupQueries();
      renderPage();
      expect(screen.getByText("Networks")).toBeInTheDocument();
      expect(screen.getByText("AMC")).toBeInTheDocument();
    });

    it("renders multiple networks as comma-separated list", () => {
      setupQueries({ networks: ["HBO", "Max"] });
      renderPage();
      expect(screen.getByText("HBO, Max")).toBeInTheDocument();
    });

    it("does not render networks when empty", () => {
      setupQueries({ networks: [] });
      renderPage();
      expect(screen.queryByText("Networks")).not.toBeInTheDocument();
    });
  });

  describe("genres", () => {
    it("renders genre badges", () => {
      setupQueries();
      renderPage();
      expect(screen.getByText("Drama")).toBeInTheDocument();
      expect(screen.getByText("Crime")).toBeInTheDocument();
    });
  });

  describe("overview", () => {
    it("renders overview text", () => {
      setupQueries();
      renderPage();
      expect(screen.getByText("A chemistry teacher turned meth cook.")).toBeInTheDocument();
    });
  });
});
