import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { SeasonDetailPage } from "./SeasonDetailPage";

// --- tRPC mock setup ---

const {
  mockShowQuery,
  mockSeasonsQuery,
  mockEpisodesQuery,
  mockWatchHistoryQuery,
  mockProgressQuery,
  mockCheckSeriesQuery,
  mockSonarrEpisodesQuery,
  mockBatchLogMutation,
  mockLogMutation,
  mockDeleteMutation,
  mockSeasonMonitorMutation,
  mockEpisodeMonitorMutation,
  mockInvalidate,
  mockCancel,
  mockSetProgressData,
  mockSetListData,
} = vi.hoisted(() => ({
  mockShowQuery: vi.fn(),
  mockSeasonsQuery: vi.fn(),
  mockEpisodesQuery: vi.fn(),
  mockWatchHistoryQuery: vi.fn(),
  mockProgressQuery: vi.fn(),
  mockCheckSeriesQuery: vi.fn(),
  mockSonarrEpisodesQuery: vi.fn(),
  mockBatchLogMutation: vi.fn(),
  mockLogMutation: vi.fn(),
  mockDeleteMutation: vi.fn(),
  mockSeasonMonitorMutation: vi.fn(),
  mockEpisodeMonitorMutation: vi.fn(),
  mockInvalidate: vi.fn(),
  mockCancel: vi.fn(),
  mockSetProgressData: vi.fn(),
  mockSetListData: vi.fn(),
}));

let batchLogOpts: Record<string, unknown> = {};

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
        listEpisodes: {
          useQuery: (...args: unknown[]) => mockEpisodesQuery(...args),
        },
      },
      watchHistory: {
        list: {
          useQuery: (...args: unknown[]) => mockWatchHistoryQuery(...args),
        },
        progress: {
          useQuery: (...args: unknown[]) => mockProgressQuery(...args),
        },
        log: {
          useMutation: (opts: Record<string, unknown>) => {
            mockLogMutation.mockImplementation(() => {
              if (typeof opts.onSuccess === "function") (opts.onSuccess as () => void)();
            });
            return { mutate: mockLogMutation, isPending: false };
          },
        },
        delete: {
          useMutation: (opts: Record<string, unknown>) => {
            mockDeleteMutation.mockImplementation(() => {
              if (typeof opts.onSuccess === "function") (opts.onSuccess as () => void)();
            });
            return { mutate: mockDeleteMutation, isPending: false };
          },
        },
        batchLog: {
          useMutation: (opts: Record<string, unknown>) => {
            batchLogOpts = opts;
            mockBatchLogMutation.mockImplementation(() => {
              if (typeof opts.onMutate === "function") (opts.onMutate as () => void)();
              if (typeof opts.onSuccess === "function")
                (opts.onSuccess as (r: unknown) => void)({ data: { logged: 5 } });
              if (typeof opts.onSettled === "function") (opts.onSettled as () => void)();
            });
            return { mutate: mockBatchLogMutation, isPending: false };
          },
        },
        invalidate: mockInvalidate,
      },
      arr: {
        checkSeries: {
          useQuery: (...args: unknown[]) => mockCheckSeriesQuery(...args),
        },
        getSeriesEpisodes: {
          useQuery: (...args: unknown[]) => mockSonarrEpisodesQuery(...args),
          invalidate: mockInvalidate,
        },
        updateSeasonMonitoring: {
          useMutation: (opts: Record<string, unknown>) => {
            mockSeasonMonitorMutation.mockImplementation(() => {
              if (typeof opts.onSuccess === "function") (opts.onSuccess as () => void)();
            });
            return { mutate: mockSeasonMonitorMutation, isPending: false };
          },
        },
        updateEpisodeMonitoring: {
          useMutation: (opts: Record<string, unknown>) => {
            mockEpisodeMonitorMutation.mockImplementation(
              (variables: { episodeIds: number[]; monitored: boolean }) => {
                if (typeof opts.onSuccess === "function") (opts.onSuccess as () => void)();
                if (typeof opts.onSettled === "function")
                  (opts.onSettled as (d: unknown, e: unknown, v: typeof variables) => void)(
                    undefined,
                    undefined,
                    variables
                  );
              }
            );
            return { mutate: mockEpisodeMonitorMutation, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      media: {
        watchHistory: {
          list: {
            invalidate: mockInvalidate,
            cancel: mockCancel,
            getData: vi.fn(),
            setData: mockSetListData,
          },
          progress: {
            cancel: mockCancel,
            getData: vi.fn(),
            setData: mockSetProgressData,
          },
          invalidate: mockInvalidate,
        },
        arr: {
          checkSeries: { invalidate: mockInvalidate },
          getSeriesEpisodes: { invalidate: mockInvalidate },
        },
      },
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
  posterUrl: "/poster.jpg",
  backdropUrl: "/backdrop.jpg",
  voteAverage: 9.5,
  voteCount: 10000,
  genres: ["Drama"],
  networks: ["AMC"],
};

const SEASONS = [
  {
    id: 11,
    seasonNumber: 1,
    name: "Season 1",
    episodeCount: 3,
    posterUrl: "/s1-poster.jpg",
    overview: "The beginning.",
    airDate: "2008-01-20",
  },
  {
    id: 12,
    seasonNumber: 2,
    name: "Season 2",
    episodeCount: 5,
    posterUrl: null,
    overview: null,
    airDate: "2009-03-08",
  },
];

const EPISODES = [
  {
    id: 101,
    episodeNumber: 1,
    name: "Pilot",
    overview: "Walter starts cooking.",
    airDate: "2008-01-20",
    runtime: 58,
  },
  {
    id: 102,
    episodeNumber: 2,
    name: "Cat's in the Bag",
    overview: "Clean up.",
    airDate: "2008-01-27",
    runtime: 48,
  },
  {
    id: 103,
    episodeNumber: 3,
    name: "...And the Bag's in the River",
    overview: null,
    airDate: "2008-02-10",
    runtime: 48,
  },
  {
    id: 104,
    episodeNumber: 4,
    name: "Future Episode",
    overview: null,
    airDate: "2099-12-31",
    runtime: 50,
  },
];

const PROGRESS = {
  tvShowId: 1,
  overall: { watched: 2, total: 3, percentage: 67 },
  seasons: [{ seasonId: 11, seasonNumber: 1, watched: 2, total: 3, percentage: 67 }],
  nextEpisode: { seasonNumber: 1, episodeNumber: 3, episodeName: "...And the Bag's in the River" },
};

// --- Helpers ---

function renderPage(showId = "1", seasonNum = "1") {
  return render(
    <MemoryRouter initialEntries={[`/media/tv/${showId}/season/${seasonNum}`]}>
      <Routes>
        <Route path="/media/tv/:id/season/:num" element={<SeasonDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const SONARR_EPISODES = [
  {
    id: 5001,
    seriesId: 42,
    seasonNumber: 1,
    episodeNumber: 1,
    title: "Pilot",
    monitored: true,
    hasFile: true,
  },
  {
    id: 5002,
    seriesId: 42,
    seasonNumber: 1,
    episodeNumber: 2,
    title: "Cat's in the Bag",
    monitored: true,
    hasFile: true,
  },
  {
    id: 5003,
    seriesId: 42,
    seasonNumber: 1,
    episodeNumber: 3,
    title: "...And the Bag's in the River",
    monitored: false,
    hasFile: false,
  },
  {
    id: 5004,
    seriesId: 42,
    seasonNumber: 1,
    episodeNumber: 4,
    title: "Future Episode",
    monitored: true,
    hasFile: false,
  },
];

function setupQueries(
  overrides: {
    show?: Record<string, unknown>;
    seasons?: typeof SEASONS;
    episodes?: typeof EPISODES;
    progress?: typeof PROGRESS | null;
    sonarr?: {
      exists: boolean;
      sonarrId?: number;
      monitored?: boolean;
      seasons?: Array<{ seasonNumber: number; monitored: boolean }>;
    } | null;
    sonarrEpisodes?: typeof SONARR_EPISODES | null;
    watchHistory?: Array<{ id: number; mediaId: number }>;
  } = {}
) {
  mockShowQuery.mockReturnValue({
    data: { data: { ...SHOW, ...overrides.show } },
    isLoading: false,
    error: null,
  });
  mockSeasonsQuery.mockReturnValue({
    data: { data: overrides.seasons ?? SEASONS },
    isLoading: false,
  });
  mockEpisodesQuery.mockReturnValue({
    data: { data: overrides.episodes ?? EPISODES },
    isLoading: false,
  });
  mockWatchHistoryQuery.mockReturnValue({
    data: {
      data: overrides.watchHistory ?? [
        { id: 1001, mediaId: 101 },
        { id: 1002, mediaId: 102 },
      ],
    },
    isLoading: false,
  });
  mockProgressQuery.mockReturnValue({
    data: { data: overrides.progress ?? PROGRESS },
    isLoading: false,
  });
  mockCheckSeriesQuery.mockReturnValue({
    data: {
      data: overrides.sonarr ?? {
        exists: true,
        sonarrId: 42,
        monitored: true,
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: true },
        ],
      },
    },
    isLoading: false,
  });
  mockSonarrEpisodesQuery.mockReturnValue({
    data: {
      data: overrides.sonarrEpisodes ?? SONARR_EPISODES,
    },
    isLoading: false,
  });
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  batchLogOpts = {};
  mockShowQuery.mockReturnValue({ data: null, isLoading: false, error: null });
  mockSeasonsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
  mockEpisodesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
  mockWatchHistoryQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
  mockProgressQuery.mockReturnValue({ data: null, isLoading: false });
  mockCheckSeriesQuery.mockReturnValue({ data: null, isLoading: false });
  mockSonarrEpisodesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
});

describe("SeasonDetailPage — monitoring", () => {
  describe("season monitoring toggle", () => {
    it("shows monitoring toggle when series exists in Sonarr", () => {
      setupQueries();
      renderPage();
      expect(screen.getByRole("switch", { name: "Monitor Season 1" })).toBeInTheDocument();
    });

    it("hides monitoring toggle when series is not in Sonarr", () => {
      setupQueries({ sonarr: { exists: false } });
      renderPage();
      expect(screen.queryByRole("switch", { name: "Monitor Season 1" })).not.toBeInTheDocument();
    });

    it("hides monitoring toggle when Sonarr data is not loaded", () => {
      setupQueries({ sonarr: null });
      mockCheckSeriesQuery.mockReturnValue({ data: null, isLoading: true });
      renderPage();
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    });

    it("shows 'Monitored' label when toggle is on", () => {
      setupQueries();
      renderPage();
      expect(screen.getByText("Monitored")).toBeInTheDocument();
    });

    it("calls updateSeasonMonitoring when toggle is clicked", () => {
      setupQueries();
      renderPage();
      const toggle = screen.getByRole("switch", { name: "Monitor Season 1" });
      fireEvent.click(toggle);
      expect(mockSeasonMonitorMutation).toHaveBeenCalledWith({
        sonarrId: 42,
        seasonNumber: 1,
        monitored: false,
      });
    });

    it("shows 'Unmonitored' label after toggling off", () => {
      setupQueries();
      renderPage();
      const toggle = screen.getByRole("switch", { name: "Monitor Season 1" });
      fireEvent.click(toggle);
      expect(screen.getByText("Unmonitored")).toBeInTheDocument();
    });
  });

  describe("rendering", () => {
    it("renders season header with name and episode count", () => {
      setupQueries();
      renderPage();
      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings.some((h) => h.textContent === "Season 1")).toBe(true);
      expect(screen.getByText("4 episodes")).toBeInTheDocument();
    });

    it("renders episodes section", () => {
      setupQueries();
      renderPage();
      expect(screen.getByRole("heading", { name: "Episodes" })).toBeInTheDocument();
      expect(screen.getByText("Pilot")).toBeInTheDocument();
      expect(screen.getByText("Cat's in the Bag")).toBeInTheDocument();
    });

    it("renders progress bar when progress data exists", () => {
      setupQueries();
      const { container } = renderPage();
      const bar = container.querySelector("[style*='width: 67%']");
      expect(bar).toBeInTheDocument();
    });
  });

  describe("upcoming episodes", () => {
    it("dims future episodes and shows Upcoming label", () => {
      setupQueries();
      renderPage();
      expect(screen.getByText("Upcoming")).toBeInTheDocument();
    });

    it("disables watch toggle for upcoming episodes", () => {
      setupQueries();
      renderPage();
      const upcomingButton = screen.getByLabelText("Episode 4 upcoming");
      expect(upcomingButton).toBeDisabled();
    });
  });

  describe("batch mark watched", () => {
    it("shows Mark Season Watched button when not all watched", () => {
      setupQueries();
      renderPage();
      expect(screen.getByText("Mark Season Watched")).toBeInTheDocument();
    });

    it("calls batchLogMutation on Mark Season Watched click", () => {
      setupQueries();
      renderPage();
      fireEvent.click(screen.getByText("Mark Season Watched"));
      expect(mockBatchLogMutation).toHaveBeenCalledWith({
        mediaType: "season",
        mediaId: 11,
      });
    });

    it("shows All Watched when season is complete", () => {
      setupQueries({
        progress: {
          tvShowId: 1,
          overall: { watched: 3, total: 3, percentage: 100 },
          seasons: [{ seasonId: 11, seasonNumber: 1, watched: 3, total: 3, percentage: 100 }],
          nextEpisode: { seasonNumber: 1, episodeNumber: 4, episodeName: "Next" },
        },
      });
      renderPage();
      expect(screen.getByText("All Watched")).toBeInTheDocument();
      expect(screen.queryByText("Mark Season Watched")).not.toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("shows error for invalid parameters", () => {
      renderPage("abc", "xyz");
      expect(screen.getByText("Invalid parameters")).toBeInTheDocument();
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

  describe("batch mark watched — optimistic updates", () => {
    it("shows Mark Season Watched button when not fully watched", () => {
      setupQueries();
      renderPage();
      expect(screen.getByRole("button", { name: /Mark Season Watched/ })).toBeInTheDocument();
    });

    it("shows All Watched when season is fully watched", () => {
      setupQueries({
        progress: {
          ...PROGRESS,
          seasons: [{ seasonId: 11, seasonNumber: 1, watched: 3, total: 3, percentage: 100 }],
        },
      });
      renderPage();
      expect(screen.queryByRole("button", { name: /Mark Season Watched/ })).not.toBeInTheDocument();
      expect(screen.getByText("All Watched")).toBeInTheDocument();
    });

    it("calls batchLog mutation when Mark Season Watched is clicked", () => {
      setupQueries();
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Mark Season Watched/ }));
      expect(mockBatchLogMutation).toHaveBeenCalledWith({
        mediaType: "season",
        mediaId: 11,
      });
    });

    it("triggers optimistic progress cancel on batch mark", () => {
      setupQueries();
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Mark Season Watched/ }));
      expect(mockCancel).toHaveBeenCalled();
    });

    it("invalidates watch history after batch mark settles", () => {
      setupQueries();
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Mark Season Watched/ }));
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  describe("episode monitoring toggles", () => {
    it("shows monitoring toggle for each episode when series exists in Sonarr", () => {
      setupQueries();
      renderPage();
      expect(screen.getByRole("switch", { name: "Monitor episode 1" })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Monitor episode 2" })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Monitor episode 3" })).toBeInTheDocument();
    });

    it("reflects monitoring state from Sonarr data", () => {
      setupQueries();
      renderPage();
      const ep1Toggle = screen.getByRole("switch", { name: "Monitor episode 1" });
      const ep3Toggle = screen.getByRole("switch", { name: "Monitor episode 3" });
      expect(ep1Toggle).toBeChecked();
      expect(ep3Toggle).not.toBeChecked();
    });

    it("hides monitoring toggles when series is not in Sonarr", () => {
      setupQueries({ sonarr: { exists: false }, sonarrEpisodes: null });
      mockSonarrEpisodesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
      renderPage();
      expect(screen.queryByRole("switch", { name: /Monitor episode/ })).not.toBeInTheDocument();
    });

    it("calls updateEpisodeMonitoring when episode toggle is clicked", () => {
      setupQueries();
      renderPage();
      const ep1Toggle = screen.getByRole("switch", { name: "Monitor episode 1" });
      fireEvent.click(ep1Toggle);
      expect(mockEpisodeMonitorMutation).toHaveBeenCalledWith({
        episodeIds: [5001],
        monitored: false,
      });
    });

    it("optimistically updates toggle state on click", () => {
      setupQueries();
      renderPage();
      const ep1Toggle = screen.getByRole("switch", { name: "Monitor episode 1" });
      fireEvent.click(ep1Toggle);
      // After clicking, ep1 should show unchecked optimistically
      expect(ep1Toggle).not.toBeChecked();
    });
  });

  describe("downloaded indicator", () => {
    it("shows download icon for episodes with files", () => {
      setupQueries();
      renderPage();
      expect(screen.getByLabelText("Episode 1 downloaded")).toBeInTheDocument();
      expect(screen.getByLabelText("Episode 2 downloaded")).toBeInTheDocument();
    });

    it("does not show download icon for episodes without files", () => {
      setupQueries();
      renderPage();
      expect(screen.queryByLabelText("Episode 3 downloaded")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Episode 4 downloaded")).not.toBeInTheDocument();
    });

    it("hides download icons when series is not in Sonarr", () => {
      setupQueries({ sonarr: { exists: false }, sonarrEpisodes: null });
      mockSonarrEpisodesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
      renderPage();
      expect(screen.queryByLabelText(/downloaded/)).not.toBeInTheDocument();
    });
  });

  describe("batch monitor toggle", () => {
    it("shows Monitor All button when not all episodes are monitored", () => {
      setupQueries();
      renderPage();
      expect(screen.getByRole("button", { name: "Monitor All" })).toBeInTheDocument();
    });

    it("shows Unmonitor All button when all episodes are monitored", () => {
      const allMonitored = SONARR_EPISODES.map((ep) => ({ ...ep, monitored: true }));
      setupQueries({ sonarrEpisodes: allMonitored });
      renderPage();
      expect(screen.getByRole("button", { name: "Unmonitor All" })).toBeInTheDocument();
    });

    it("calls updateEpisodeMonitoring with all episode IDs when batch button clicked", () => {
      setupQueries();
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Monitor All" }));
      expect(mockEpisodeMonitorMutation).toHaveBeenCalledWith({
        episodeIds: [5001, 5002, 5003, 5004],
        monitored: true,
      });
    });

    it("hides batch toggle when series is not in Sonarr", () => {
      setupQueries({ sonarr: { exists: false }, sonarrEpisodes: null });
      mockSonarrEpisodesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
      renderPage();
      expect(screen.queryByRole("button", { name: /Monitor All/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Unmonitor All/ })).not.toBeInTheDocument();
    });
  });
});
