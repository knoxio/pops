import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  tvShowsGetMock,
  tvShowsListSeasonsMock,
  tvShowsListEpisodesMock,
  watchHistoryListMock,
  watchHistoryProgressMock,
  arrCheckSeriesMock,
  arrGetSeriesEpisodesMock,
  watchHistoryBatchLogMock,
  watchHistoryLogMock,
  watchHistoryDeleteMock,
  arrUpdateSeasonMonitoringMock,
  arrUpdateEpisodeMonitoringMock,
} = vi.hoisted(() => ({
  tvShowsGetMock: vi.fn(),
  tvShowsListSeasonsMock: vi.fn(),
  tvShowsListEpisodesMock: vi.fn(),
  watchHistoryListMock: vi.fn(),
  watchHistoryProgressMock: vi.fn(),
  arrCheckSeriesMock: vi.fn(),
  arrGetSeriesEpisodesMock: vi.fn(),
  watchHistoryBatchLogMock: vi.fn(),
  watchHistoryLogMock: vi.fn(),
  watchHistoryDeleteMock: vi.fn(),
  arrUpdateSeasonMonitoringMock: vi.fn(),
  arrUpdateEpisodeMonitoringMock: vi.fn(),
}));

vi.mock('../media-api/index.js', () => ({
  tvShowsGet: (...args: unknown[]) => tvShowsGetMock(...args),
  tvShowsListSeasons: (...args: unknown[]) => tvShowsListSeasonsMock(...args),
  tvShowsListEpisodes: (...args: unknown[]) => tvShowsListEpisodesMock(...args),
  watchHistoryList: (...args: unknown[]) => watchHistoryListMock(...args),
  watchHistoryProgress: (...args: unknown[]) => watchHistoryProgressMock(...args),
  arrCheckSeries: (...args: unknown[]) => arrCheckSeriesMock(...args),
  arrGetSeriesEpisodes: (...args: unknown[]) => arrGetSeriesEpisodesMock(...args),
  watchHistoryBatchLog: (...args: unknown[]) => watchHistoryBatchLogMock(...args),
  watchHistoryLog: (...args: unknown[]) => watchHistoryLogMock(...args),
  watchHistoryDelete: (...args: unknown[]) => watchHistoryDeleteMock(...args),
  arrUpdateSeasonMonitoring: (...args: unknown[]) => arrUpdateSeasonMonitoringMock(...args),
  arrUpdateEpisodeMonitoring: (...args: unknown[]) => arrUpdateEpisodeMonitoringMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SeasonDetailPage } from './SeasonDetailPage';

function ok<T>(data: T) {
  return { data, error: undefined };
}

const SHOW = {
  id: 1,
  tvdbId: 81189,
  name: 'Breaking Bad',
  overview: 'A chemistry teacher turned meth cook.',
  posterUrl: '/poster.jpg',
};

const SEASONS = [
  {
    id: 11,
    seasonNumber: 1,
    name: 'Season 1',
    posterUrl: '/s1-poster.jpg',
    overview: 'The beginning.',
    airDate: '2008-01-20',
  },
  {
    id: 12,
    seasonNumber: 2,
    name: 'Season 2',
    posterUrl: null,
    overview: null,
    airDate: '2009-03-08',
  },
];

const EPISODES = [
  {
    id: 101,
    episodeNumber: 1,
    name: 'Pilot',
    overview: 'Walter starts cooking.',
    airDate: '2008-01-20',
    runtime: 58,
  },
  {
    id: 102,
    episodeNumber: 2,
    name: "Cat's in the Bag",
    overview: 'Clean up.',
    airDate: '2008-01-27',
    runtime: 48,
  },
  {
    id: 103,
    episodeNumber: 3,
    name: "...And the Bag's in the River",
    overview: null,
    airDate: '2008-02-10',
    runtime: 48,
  },
  {
    id: 104,
    episodeNumber: 4,
    name: 'Future Episode',
    overview: null,
    airDate: '2099-12-31',
    runtime: 50,
  },
];

const PROGRESS = {
  tvShowId: 1,
  overall: { watched: 2, total: 3, percentage: 67 },
  seasons: [{ seasonId: 11, seasonNumber: 1, watched: 2, total: 3, percentage: 67 }],
  nextEpisode: { seasonNumber: 1, episodeNumber: 3, episodeName: "...And the Bag's in the River" },
};

const SONARR_SERIES = {
  exists: true,
  sonarrId: 42,
  monitored: true,
  seasons: [
    { seasonNumber: 1, monitored: true },
    { seasonNumber: 2, monitored: true },
  ],
};

const SONARR_EPISODES = [
  {
    id: 5001,
    seriesId: 42,
    seasonNumber: 1,
    episodeNumber: 1,
    title: 'Pilot',
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
    title: 'Future Episode',
    monitored: true,
    hasFile: false,
  },
];

type Overrides = {
  show?: Record<string, unknown>;
  seasons?: typeof SEASONS;
  episodes?: typeof EPISODES;
  progress?: typeof PROGRESS | null;
  sonarr?: {
    exists: boolean;
    sonarrId?: number;
    monitored?: boolean;
    seasons?: Array<{ seasonNumber: number; monitored: boolean }>;
  };
  sonarrEpisodes?: typeof SONARR_EPISODES | null;
  watchHistory?: Array<{ id: number; mediaId: number }>;
};

function setupQueries(overrides: Overrides = {}) {
  tvShowsGetMock.mockResolvedValue(ok({ data: { ...SHOW, ...overrides.show } }));
  tvShowsListSeasonsMock.mockResolvedValue(ok({ data: overrides.seasons ?? SEASONS, total: 2 }));
  tvShowsListEpisodesMock.mockResolvedValue(ok({ data: overrides.episodes ?? EPISODES }));
  watchHistoryListMock.mockResolvedValue(
    ok({
      data: (
        overrides.watchHistory ?? [
          { id: 1001, mediaId: 101 },
          { id: 1002, mediaId: 102 },
        ]
      ).map((e) => ({ ...e, mediaType: 'episode', watchedAt: '2026-01-01', completed: 1 })),
      pagination: { hasMore: false, limit: 500, offset: 0, total: 2 },
    })
  );
  watchHistoryProgressMock.mockResolvedValue(ok({ data: overrides.progress ?? PROGRESS }));
  arrCheckSeriesMock.mockResolvedValue(ok({ data: overrides.sonarr ?? SONARR_SERIES }));
  arrGetSeriesEpisodesMock.mockResolvedValue(
    ok({ data: overrides.sonarrEpisodes ?? SONARR_EPISODES })
  );
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage(showId = '1', seasonNum = '1', queryClient = makeQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const view = render(
    <MemoryRouter initialEntries={[`/media/tv/${showId}/season/${seasonNum}`]}>
      <Routes>
        <Route path="/media/tv/:id/season/:num" element={<SeasonDetailPage />} />
      </Routes>
    </MemoryRouter>,
    { wrapper }
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  watchHistoryBatchLogMock.mockResolvedValue(
    ok({ data: { logged: 5, skipped: 0 }, message: 'ok' })
  );
  watchHistoryLogMock.mockResolvedValue(
    ok({
      data: { completed: 1, id: 9, mediaId: 0, mediaType: 'episode', watchedAt: '' },
      message: 'ok',
      watchlistRemoved: false,
    })
  );
  watchHistoryDeleteMock.mockResolvedValue(ok({ message: 'ok' }));
  arrUpdateSeasonMonitoringMock.mockResolvedValue(ok({ message: 'ok' }));
  arrUpdateEpisodeMonitoringMock.mockResolvedValue(ok({ message: 'ok' }));
});

describe('SeasonDetailPage — monitoring', () => {
  describe('season monitoring toggle', () => {
    it('shows monitoring toggle when series exists in Sonarr', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByRole('switch', { name: 'Monitor Season 1' })).toBeInTheDocument();
    });

    it('hides monitoring toggle when series is not in Sonarr', async () => {
      setupQueries({ sonarr: { exists: false } });
      renderPage();
      expect(await screen.findByText('Pilot')).toBeInTheDocument();
      expect(screen.queryByRole('switch', { name: 'Monitor Season 1' })).not.toBeInTheDocument();
    });

    it("shows 'Monitored' label when toggle is on", async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByText('Monitored')).toBeInTheDocument();
    });

    it('calls arrUpdateSeasonMonitoring when toggle is clicked', async () => {
      setupQueries();
      renderPage();
      const toggle = await screen.findByRole('switch', { name: 'Monitor Season 1' });
      fireEvent.click(toggle);
      await waitFor(() =>
        expect(arrUpdateSeasonMonitoringMock).toHaveBeenCalledWith({
          path: { sonarrId: 42, seasonNumber: 1 },
          body: { monitored: false },
        })
      );
    });

    it("shows 'Unmonitored' label after toggling off", async () => {
      setupQueries();
      renderPage();
      const toggle = await screen.findByRole('switch', { name: 'Monitor Season 1' });
      fireEvent.click(toggle);
      expect(await screen.findByText('Unmonitored')).toBeInTheDocument();
    });
  });

  describe('rendering', () => {
    it('renders season header with name and episode count', async () => {
      setupQueries();
      renderPage();
      await waitFor(() => {
        const headings = screen.getAllByRole('heading', { level: 1 });
        expect(headings.some((h) => h.textContent === 'Season 1')).toBe(true);
      });
      expect(await screen.findByText('4 episodes')).toBeInTheDocument();
    });

    it('renders episodes section', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByRole('heading', { name: 'Episodes' })).toBeInTheDocument();
      expect(await screen.findByText('Pilot')).toBeInTheDocument();
      expect(screen.getByText("Cat's in the Bag")).toBeInTheDocument();
    });

    it('renders progress bar when progress data exists', async () => {
      setupQueries();
      const { container } = renderPage();
      await waitFor(() =>
        expect(container.querySelector('[aria-valuenow="67"]')).toBeInTheDocument()
      );
    });
  });

  describe('upcoming episodes', () => {
    it('dims future episodes and shows Upcoming label', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByText('Upcoming')).toBeInTheDocument();
    });

    it('disables watch toggle for upcoming episodes', async () => {
      setupQueries();
      renderPage();
      const upcomingButton = await screen.findByLabelText('Episode 4 upcoming');
      expect(upcomingButton).toBeDisabled();
    });
  });

  describe('batch mark watched', () => {
    it('shows Mark Season Watched button when not all watched', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByText('Mark Season Watched')).toBeInTheDocument();
    });

    it('calls watchHistoryBatchLog on Mark Season Watched click', async () => {
      setupQueries();
      renderPage();
      fireEvent.click(await screen.findByText('Mark Season Watched'));
      await waitFor(() =>
        expect(watchHistoryBatchLogMock).toHaveBeenCalledWith({
          body: { mediaType: 'season', mediaId: 11, completed: 1 },
        })
      );
    });

    it('writes optimistic progress into the cache on batch mark', async () => {
      setupQueries();
      const { queryClient } = renderPage();
      fireEvent.click(await screen.findByText('Mark Season Watched'));
      await waitFor(() => {
        const cached = queryClient.getQueryData<typeof PROGRESS>([
          'media',
          'watchHistory',
          'progress',
          { tvShowId: 1 },
        ]);
        const season1 = cached?.seasons?.find((s) => s.seasonNumber === 1);
        expect(season1?.watched).toBe(season1?.total);
      });
    });

    it('invalidates watchHistory queries after settle', async () => {
      setupQueries();
      const { queryClient } = renderPage();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      fireEvent.click(await screen.findByText('Mark Season Watched'));
      await waitFor(() =>
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['media', 'watchHistory'] })
      );
    });

    it('shows All Watched when season is complete', async () => {
      setupQueries({
        progress: {
          tvShowId: 1,
          overall: { watched: 3, total: 3, percentage: 100 },
          seasons: [{ seasonId: 11, seasonNumber: 1, watched: 3, total: 3, percentage: 100 }],
          nextEpisode: { seasonNumber: 1, episodeNumber: 4, episodeName: 'Next' },
        },
      });
      renderPage();
      expect(await screen.findByText('All Watched')).toBeInTheDocument();
      expect(screen.queryByText('Mark Season Watched')).not.toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('shows error for invalid parameters', () => {
      renderPage('abc', 'xyz');
      expect(screen.getByText('Invalid parameters')).toBeInTheDocument();
    });

    it('shows not found for missing show', async () => {
      setupQueries();
      tvShowsGetMock.mockResolvedValue({
        data: undefined,
        error: { message: 'not found' },
        response: { status: 404 },
      });
      renderPage('999');
      expect(await screen.findByText('Show not found')).toBeInTheDocument();
    });
  });

  describe('episode monitoring toggles', () => {
    it('shows monitoring toggle for each episode when series exists in Sonarr', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByRole('switch', { name: 'Monitor episode 1' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Monitor episode 2' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Monitor episode 3' })).toBeInTheDocument();
    });

    it('reflects monitoring state from Sonarr data', async () => {
      setupQueries();
      renderPage();
      const ep1Toggle = await screen.findByRole('switch', { name: 'Monitor episode 1' });
      const ep3Toggle = screen.getByRole('switch', { name: 'Monitor episode 3' });
      expect(ep1Toggle).toBeChecked();
      expect(ep3Toggle).not.toBeChecked();
    });

    it('hides monitoring toggles when series is not in Sonarr', async () => {
      setupQueries({ sonarr: { exists: false }, sonarrEpisodes: [] });
      renderPage();
      expect(await screen.findByText('Pilot')).toBeInTheDocument();
      expect(screen.queryByRole('switch', { name: /Monitor episode/ })).not.toBeInTheDocument();
    });

    it('calls arrUpdateEpisodeMonitoring when episode toggle is clicked', async () => {
      setupQueries();
      renderPage();
      const ep1Toggle = await screen.findByRole('switch', { name: 'Monitor episode 1' });
      fireEvent.click(ep1Toggle);
      await waitFor(() =>
        expect(arrUpdateEpisodeMonitoringMock).toHaveBeenCalledWith({
          body: { episodeIds: [5001], monitored: false },
        })
      );
    });

    it('optimistically updates toggle state on click', async () => {
      setupQueries();
      renderPage();
      const ep1Toggle = await screen.findByRole('switch', { name: 'Monitor episode 1' });
      fireEvent.click(ep1Toggle);
      await waitFor(() => expect(ep1Toggle).not.toBeChecked());
    });
  });

  describe('downloaded indicator', () => {
    it('shows download icon for episodes with files', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByLabelText('Episode 1 downloaded')).toBeInTheDocument();
      expect(screen.getByLabelText('Episode 2 downloaded')).toBeInTheDocument();
    });

    it('does not show download icon for episodes without files', async () => {
      setupQueries();
      renderPage();
      await screen.findByLabelText('Episode 1 downloaded');
      expect(screen.queryByLabelText('Episode 3 downloaded')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Episode 4 downloaded')).not.toBeInTheDocument();
    });

    it('hides download icons when series is not in Sonarr', async () => {
      setupQueries({ sonarr: { exists: false }, sonarrEpisodes: [] });
      renderPage();
      expect(await screen.findByText('Pilot')).toBeInTheDocument();
      expect(screen.queryByLabelText(/downloaded/)).not.toBeInTheDocument();
    });
  });

  describe('batch monitor toggle', () => {
    it('shows Monitor All button when not all episodes are monitored', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByRole('button', { name: 'Monitor All' })).toBeInTheDocument();
    });

    it('shows Unmonitor All button when all episodes are monitored', async () => {
      const allMonitored = SONARR_EPISODES.map((ep) => ({ ...ep, monitored: true }));
      setupQueries({ sonarrEpisodes: allMonitored });
      renderPage();
      expect(await screen.findByRole('button', { name: 'Unmonitor All' })).toBeInTheDocument();
    });

    it('calls arrUpdateEpisodeMonitoring with all episode IDs when batch button clicked', async () => {
      setupQueries();
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Monitor All' }));
      await waitFor(() =>
        expect(arrUpdateEpisodeMonitoringMock).toHaveBeenCalledWith({
          body: { episodeIds: [5001, 5002, 5003, 5004], monitored: true },
        })
      );
    });

    it('hides batch toggle when series is not in Sonarr', async () => {
      setupQueries({ sonarr: { exists: false }, sonarrEpisodes: [] });
      renderPage();
      expect(await screen.findByText('Pilot')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Monitor All/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Unmonitor All/ })).not.toBeInTheDocument();
    });
  });
});
