import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaApiError } from '../media-api-helpers.js';

const {
  tvShowsGetMock,
  tvShowsListSeasonsMock,
  watchHistoryProgressMock,
  arrCheckSeriesMock,
  watchHistoryBatchLogMock,
  arrUpdateSeasonMonitoringMock,
} = vi.hoisted(() => ({
  tvShowsGetMock: vi.fn(),
  tvShowsListSeasonsMock: vi.fn(),
  watchHistoryProgressMock: vi.fn(),
  arrCheckSeriesMock: vi.fn(),
  watchHistoryBatchLogMock: vi.fn(),
  arrUpdateSeasonMonitoringMock: vi.fn(),
}));

vi.mock('../media-api/index.js', () => ({
  tvShowsGet: (...args: unknown[]) => tvShowsGetMock(...args),
  tvShowsListSeasons: (...args: unknown[]) => tvShowsListSeasonsMock(...args),
  watchHistoryProgress: (...args: unknown[]) => watchHistoryProgressMock(...args),
  arrCheckSeries: (...args: unknown[]) => arrCheckSeriesMock(...args),
  watchHistoryBatchLog: (...args: unknown[]) => watchHistoryBatchLogMock(...args),
  arrUpdateSeasonMonitoring: (...args: unknown[]) => arrUpdateSeasonMonitoringMock(...args),
}));

vi.mock('../components/ArrStatusBadge', () => ({
  ArrStatusBadge: () => null,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TvShowDetailPage } from './TvShowDetailPage';

function ok<T>(data: T) {
  return { data, error: undefined };
}

const SHOW = {
  id: 1,
  tvdbId: 81189,
  name: 'Breaking Bad',
  overview: 'A chemistry teacher turned meth cook.',
  firstAirDate: '2008-01-20',
  lastAirDate: '2013-09-29',
  status: 'Ended',
  originalLanguage: 'en',
  posterUrl: '/media/images/tv/81189/poster.jpg',
  backdropUrl: '/media/images/tv/81189/backdrop.jpg',
  voteAverage: 9.5,
  voteCount: 10000,
  genres: ['Drama', 'Crime'],
  networks: ['AMC'],
};

const SEASONS = [
  { id: 10, seasonNumber: 0, name: 'Specials', episodeCount: 3 },
  { id: 11, seasonNumber: 1, name: 'Season 1', episodeCount: 7 },
  { id: 12, seasonNumber: 2, name: 'Season 2', episodeCount: 13 },
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
  nextEpisode: null as null | {
    seasonNumber: number;
    episodeNumber: number;
    episodeName: string | null;
  },
};

const SONARR_SERIES = {
  exists: true,
  sonarrId: 99,
  seasons: [
    { seasonNumber: 0, monitored: false },
    { seasonNumber: 1, monitored: true },
    { seasonNumber: 2, monitored: false },
    { seasonNumber: 3, monitored: true },
  ],
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage(showId = '1', queryClient = makeQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const view = render(
    <MemoryRouter initialEntries={[`/media/tv/${showId}`]}>
      <Routes>
        <Route path="/media/tv/:id" element={<TvShowDetailPage />} />
      </Routes>
    </MemoryRouter>,
    { wrapper }
  );
  return { ...view, queryClient };
}

function setupQueries(
  showOverrides: Record<string, unknown> = {},
  seasons: Array<Record<string, unknown>> = SEASONS,
  progress: Record<string, unknown> | null = PROGRESS
) {
  tvShowsGetMock.mockResolvedValue(ok({ data: { ...SHOW, ...showOverrides } }));
  tvShowsListSeasonsMock.mockResolvedValue(ok({ data: seasons, total: seasons.length }));
  watchHistoryProgressMock.mockResolvedValue(ok({ data: progress }));
}

beforeEach(() => {
  vi.clearAllMocks();
  tvShowsListSeasonsMock.mockResolvedValue(ok({ data: [], total: 0 }));
  watchHistoryProgressMock.mockResolvedValue(ok({ data: null }));
  arrCheckSeriesMock.mockResolvedValue(
    ok({ data: { exists: false, sonarrId: null, seasons: [] } })
  );
  watchHistoryBatchLogMock.mockResolvedValue(
    ok({ data: { logged: 16, skipped: 0 }, message: 'ok' })
  );
  arrUpdateSeasonMonitoringMock.mockResolvedValue(ok({ message: 'ok' }));
});

describe('TvShowDetailPage — season list', () => {
  describe('rendering', () => {
    it('renders season cards with correct data', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByRole('heading', { name: 'Seasons' })).toBeInTheDocument();
      expect(screen.getByText('Season 1')).toBeInTheDocument();
      expect(screen.getByText('Season 2')).toBeInTheDocument();
      expect(screen.getByText('Season 3')).toBeInTheDocument();
      expect(screen.getByText('Specials')).toBeInTheDocument();
    });

    it('renders episode counts', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByText('7 episodes')).toBeInTheDocument();
      expect(screen.getAllByText('13 episodes')).toHaveLength(2);
      expect(screen.getByText('3 episodes')).toBeInTheDocument();
    });

    it('shows empty state when no seasons', async () => {
      setupQueries({}, [], {
        ...PROGRESS,
        overall: { watched: 0, total: 0, percentage: 0 },
        seasons: [],
      });
      renderPage();
      expect(await screen.findByRole('heading', { name: 'Seasons' })).toBeInTheDocument();
      expect(screen.getByText('No seasons available')).toBeInTheDocument();
    });
  });

  describe('sort order', () => {
    it('puts specials (season 0) last', async () => {
      setupQueries();
      const { container } = renderPage();
      await screen.findByRole('heading', { name: 'Seasons' });
      const links = container.querySelectorAll('a[href*="/season/"]');
      expect(links).toHaveLength(4);
      expect(links[0]!.getAttribute('href')).toBe('/media/tv/1/season/1');
      expect(links[1]!.getAttribute('href')).toBe('/media/tv/1/season/2');
      expect(links[2]!.getAttribute('href')).toBe('/media/tv/1/season/3');
      expect(links[3]!.getAttribute('href')).toBe('/media/tv/1/season/0');
    });
  });

  describe('navigation', () => {
    it('links to correct season detail page', async () => {
      setupQueries();
      const { container } = renderPage();
      await screen.findByRole('heading', { name: 'Seasons' });
      const seasonLink = container.querySelector('a[href="/media/tv/1/season/2"]');
      expect(seasonLink).toBeInTheDocument();
    });
  });

  describe('progress bars', () => {
    it('renders progress bar for season with progress', async () => {
      setupQueries();
      const { container } = renderPage();
      await screen.findByRole('heading', { name: 'Seasons' });
      const progressBars = container.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBeGreaterThan(0);
    });

    it('renders green bar for completed season (100%)', async () => {
      setupQueries({}, [{ id: 11, seasonNumber: 1, name: 'Season 1', episodeCount: 7 }], {
        ...PROGRESS,
        seasons: [{ seasonId: 11, seasonNumber: 1, watched: 7, total: 7, percentage: 100 }],
      });
      const { container } = renderPage();
      await screen.findByRole('heading', { name: 'Seasons' });
      const bar = container.querySelector('[aria-valuenow="100"]');
      expect(bar).toBeInTheDocument();
      expect(bar?.className).toContain('bg-success');
    });

    it('renders accent bar for in-progress season (50%)', async () => {
      setupQueries({}, [{ id: 12, seasonNumber: 2, name: 'Season 2', episodeCount: 10 }], {
        ...PROGRESS,
        seasons: [{ seasonId: 12, seasonNumber: 2, watched: 5, total: 10, percentage: 50 }],
      });
      const { container } = renderPage();
      await screen.findByRole('heading', { name: 'Seasons' });
      const bar = container.querySelector('[aria-valuenow="50"]');
      expect(bar).toBeInTheDocument();
      expect(bar?.className).toContain('bg-primary');
    });

    it('does not render progress bar for 0% season', async () => {
      setupQueries({}, [{ id: 10, seasonNumber: 1, name: 'Season 1', episodeCount: 5 }], {
        ...PROGRESS,
        overall: { watched: 0, total: 5, percentage: 0 },
        seasons: [{ seasonId: 10, seasonNumber: 1, watched: 0, total: 5, percentage: 0 }],
      });
      const { container } = renderPage();
      await screen.findByRole('heading', { name: 'Seasons' });
      const seasonLinks = container.querySelectorAll('a[href*="/season/"]');
      expect(seasonLinks).toHaveLength(1);
      const bar = seasonLinks[0]!.querySelector('[role="progressbar"]');
      expect(bar).toBeInTheDocument();
    });
  });

  describe('404 handling', () => {
    it('shows error for invalid show ID', () => {
      renderPage('abc');
      expect(screen.getByText('Invalid show ID')).toBeInTheDocument();
    });

    it('shows not found for missing show', async () => {
      tvShowsGetMock.mockResolvedValue({
        data: undefined,
        error: { message: 'Not found' },
        response: new Response(null, { status: 404 }),
      });
      renderPage('999');
      expect(await screen.findByText('Show not found')).toBeInTheDocument();
    });

    it('shows generic error for non-404 failures', async () => {
      tvShowsGetMock.mockResolvedValue({
        data: undefined,
        error: { message: 'pillar unavailable' },
        response: new Response(null, { status: 500 }),
      });
      renderPage('1');
      expect(await screen.findByText('Error')).toBeInTheDocument();
      expect(screen.getByText('pillar unavailable')).toBeInTheDocument();
    });
  });
});

describe('TvShowDetailPage — hero and metadata', () => {
  describe('hero with backdrop', () => {
    it('renders backdrop image when backdropUrl is present', async () => {
      setupQueries();
      const { container } = renderPage();
      await screen.findByRole('heading', { level: 1 });
      const backdrop = container.querySelector('img[src="/media/images/tv/81189/backdrop.jpg"]');
      expect(backdrop).toBeInTheDocument();
    });

    it('does not render backdrop image when backdropUrl is null (fallback gradient)', async () => {
      setupQueries({ backdropUrl: null });
      const { container } = renderPage();
      await screen.findByRole('heading', { level: 1 });
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
      expect(images[0]!.getAttribute('alt')).toBe('Breaking Bad poster');
      const hero = container.querySelector('.bg-muted');
      expect(hero).toBeInTheDocument();
      const gradient = container.querySelector('.bg-gradient-to-t');
      expect(gradient).toBeInTheDocument();
    });

    it('renders poster image', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByAltText('Breaking Bad poster')).toBeInTheDocument();
    });

    it('renders a placeholder div when posterUrl is null (no img element)', async () => {
      setupQueries({ posterUrl: null });
      const { container } = renderPage();
      await screen.findByRole('heading', { level: 1 });
      expect(container.querySelector('img[alt="Breaking Bad poster"]')).not.toBeInTheDocument();
      const placeholder = container.querySelector('div.rounded-lg.bg-muted.shadow-lg');
      expect(placeholder).toBeInTheDocument();
    });

    it('renders title in h1', async () => {
      setupQueries();
      renderPage();
      const heading = await screen.findByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Breaking Bad');
    });
  });

  describe('status badge', () => {
    it('renders status text for ended show', async () => {
      setupQueries();
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      expect(screen.getAllByText('Ended').length).toBeGreaterThanOrEqual(1);
    });

    it('renders status text for returning series', async () => {
      setupQueries({ status: 'Returning Series' });
      renderPage();
      expect((await screen.findAllByText('Returning Series')).length).toBeGreaterThanOrEqual(1);
    });

    it('renders separator dot between year range and status', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByText('·')).toBeInTheDocument();
    });

    it('does not render separator when no year range', async () => {
      setupQueries({ firstAirDate: null, lastAirDate: null });
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText('·')).not.toBeInTheDocument();
      expect(screen.getAllByText('Ended').length).toBeGreaterThanOrEqual(1);
    });

    it('does not render status when status is null', async () => {
      setupQueries({ status: null });
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText('·')).not.toBeInTheDocument();
    });
  });

  describe('year range formatting', () => {
    it('shows start–end for ended show spanning multiple years', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByText('2008–2013')).toBeInTheDocument();
    });

    it('shows year–Present for returning series', async () => {
      setupQueries({
        status: 'Returning Series',
        firstAirDate: '2022-02-18',
        lastAirDate: '2024-01-12',
      });
      renderPage();
      expect(await screen.findByText('2022–Present')).toBeInTheDocument();
    });

    it('shows single year when start and end are in same year', async () => {
      setupQueries({
        firstAirDate: '2020-06-01',
        lastAirDate: '2020-12-15',
        status: 'Ended',
      });
      renderPage();
      expect(await screen.findByText('2020')).toBeInTheDocument();
    });
  });

  describe('networks display', () => {
    it('renders networks in metadata grid', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByText('Networks')).toBeInTheDocument();
      expect(screen.getByText('AMC')).toBeInTheDocument();
    });

    it('renders multiple networks as comma-separated list', async () => {
      setupQueries({ networks: ['HBO', 'Max'] });
      renderPage();
      expect(await screen.findByText('HBO, Max')).toBeInTheDocument();
    });

    it('does not render networks when empty', async () => {
      setupQueries({ networks: [] });
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText('Networks')).not.toBeInTheDocument();
    });
  });

  describe('genres', () => {
    it('renders genre badges', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByText('Drama')).toBeInTheDocument();
      expect(screen.getByText('Crime')).toBeInTheDocument();
    });
  });

  describe('overview', () => {
    it('renders overview text', async () => {
      setupQueries();
      renderPage();
      expect(await screen.findByText('A chemistry teacher turned meth cook.')).toBeInTheDocument();
    });
  });
});

describe('TvShowDetailPage — overall progress bar', () => {
  it('renders overall progress bar with label', async () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 20, total: 36, percentage: 56 },
    });
    renderPage();
    expect(await screen.findByText('20/36')).toBeInTheDocument();
  });

  it('renders green bar at 100%', async () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 36, total: 36, percentage: 100 },
      seasons: PROGRESS.seasons.map((s) => ({ ...s, watched: s.total, percentage: 100 })),
    });
    const { container } = renderPage();
    await screen.findByRole('heading', { level: 1 });
    const bars = container.querySelectorAll('[aria-valuenow="100"]');
    const greenBar = Array.from(bars).find((b) => b.className.includes('bg-success'));
    expect(greenBar).toBeTruthy();
  });

  it('renders primary bar at 50%', async () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 18, total: 36, percentage: 50 },
    });
    const { container } = renderPage();
    await screen.findByRole('heading', { level: 1 });
    const bar = container.querySelector('[aria-valuenow="50"]');
    expect(bar).toBeInTheDocument();
    expect(bar?.className).toContain('bg-primary');
  });

  it('does not render progress bar when total is 0', async () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 0, total: 0, percentage: 0 },
    });
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/\/0/)).not.toBeInTheDocument();
  });
});

describe('TvShowDetailPage — next episode indicator', () => {
  it('renders next episode link with correct text', async () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      nextEpisode: { seasonNumber: 2, episodeNumber: 9, episodeName: '4 Days Out' },
    });
    renderPage();
    expect(await screen.findByText(/Continue watching: S02E09 — 4 Days Out/)).toBeInTheDocument();
  });

  it('renders next episode without name', async () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      nextEpisode: { seasonNumber: 3, episodeNumber: 1, episodeName: null },
    });
    renderPage();
    expect(await screen.findByText('Continue watching: S03E01')).toBeInTheDocument();
  });

  it('does not render next episode when all watched', async () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 36, total: 36, percentage: 100 },
      nextEpisode: null,
    });
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/Continue watching/)).not.toBeInTheDocument();
  });

  it('links to correct season page', async () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      nextEpisode: { seasonNumber: 2, episodeNumber: 9, episodeName: '4 Days Out' },
    });
    const { container } = renderPage();
    await screen.findByText(/Continue watching/);
    const link = container.querySelector('a[href="/media/tv/1/season/2"]');
    expect(link?.textContent).toContain('Continue watching');
  });
});

describe('TvShowDetailPage — batch mark all watched', () => {
  it('shows Mark All Watched button when not all watched', async () => {
    setupQueries();
    renderPage();
    expect(await screen.findByRole('button', { name: 'Mark All Watched' })).toBeInTheDocument();
  });

  it('shows All Watched checkmark when fully watched', async () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 36, total: 36, percentage: 100 },
      seasons: PROGRESS.seasons.map((s) => ({ ...s, watched: s.total, percentage: 100 })),
    });
    renderPage();
    expect(await screen.findByText('All Watched')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark All Watched' })).not.toBeInTheDocument();
  });

  it('calls batchLog SDK with correct body on click', async () => {
    setupQueries();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark All Watched' }));
    await waitFor(() => {
      expect(watchHistoryBatchLogMock).toHaveBeenCalledWith({
        body: { mediaType: 'show', mediaId: 1, completed: 1 },
      });
    });
  });

  it('writes optimistic progress to the cache on batch mark', async () => {
    setupQueries();
    const { queryClient } = renderPage();
    await screen.findByText('20/36');
    const setSpy = vi.spyOn(queryClient, 'setQueryData');
    fireEvent.click(screen.getByRole('button', { name: 'Mark All Watched' }));
    await waitFor(() => {
      const progressWrite = setSpy.mock.calls.find(
        (call) =>
          Array.isArray(call[0]) && call[0][1] === 'watchHistory' && call[0][2] === 'progress'
      );
      expect(progressWrite).toBeTruthy();
      const written = progressWrite![1] as { data: { overall: { percentage: number } } };
      expect(written.data.overall.percentage).toBe(100);
    });
  });

  it('invalidates watch history and listSeasons after batch mark settles', async () => {
    setupQueries();
    const { queryClient } = renderPage();
    await screen.findByText('20/36');
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Mark All Watched' }));
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['media', 'watchHistory'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['media', 'tvShows', 'listSeasons'],
      });
    });
  });

  it('reverts optimistic progress on error', async () => {
    setupQueries();
    watchHistoryBatchLogMock.mockRejectedValue(new MediaApiError('Network error', 500));
    const { queryClient } = renderPage();
    await screen.findByText('20/36');
    const key = ['media', 'watchHistory', 'progress', { tvShowId: 1 }];
    const before = queryClient.getQueryData(key);
    fireEvent.click(screen.getByRole('button', { name: 'Mark All Watched' }));
    await waitFor(() => {
      expect(watchHistoryBatchLogMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(queryClient.getQueryData(key)).toEqual(before);
    });
  });
});

function setupWithSonarr(sonarr = SONARR_SERIES) {
  setupQueries();
  arrCheckSeriesMock.mockResolvedValue(ok({ data: sonarr }));
}

describe('TvShowDetailPage — season monitoring toggles', () => {
  it('shows monitoring toggle per season when series exists in Sonarr', async () => {
    setupWithSonarr();
    renderPage();
    expect(await screen.findByRole('switch', { name: 'Monitor Season 1' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Monitor Season 2' })).toBeInTheDocument();
  });

  it('reflects monitored state from Sonarr seasons data', async () => {
    setupWithSonarr();
    renderPage();
    expect(await screen.findByRole('switch', { name: 'Monitor Season 1' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Monitor Season 2' })).not.toBeChecked();
  });

  it('hides monitoring toggles when series is not in Sonarr', async () => {
    setupQueries();
    arrCheckSeriesMock.mockResolvedValue(
      ok({ data: { exists: false, sonarrId: null, seasons: [] } })
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Seasons' });
    expect(screen.queryByRole('switch', { name: /Monitor Season/ })).not.toBeInTheDocument();
  });

  it('hides monitoring toggles when Sonarr data is not loaded', async () => {
    setupQueries();
    arrCheckSeriesMock.mockResolvedValue(ok({ data: undefined }));
    renderPage();
    await screen.findByRole('heading', { name: 'Seasons' });
    expect(screen.queryByRole('switch', { name: /Monitor Season/ })).not.toBeInTheDocument();
  });

  it('calls updateSeasonMonitoring SDK when toggle is clicked', async () => {
    setupWithSonarr();
    renderPage();
    const toggle = await screen.findByRole('switch', { name: 'Monitor Season 1' });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(arrUpdateSeasonMonitoringMock).toHaveBeenCalledWith({
        path: { sonarrId: 99, seasonNumber: 1 },
        body: { monitored: false },
      });
    });
  });

  it('optimistically updates toggle state on click', async () => {
    setupWithSonarr();
    renderPage();
    const toggle = await screen.findByRole('switch', { name: 'Monitor Season 2' });
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });
});
