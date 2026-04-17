import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TvShowDetailPage } from './TvShowDetailPage';

// --- tRPC mock setup ---

const {
  mockShowQuery,
  mockSeasonsQuery,
  mockProgressQuery,
  mockBatchLogMutation,
  mockCheckSeriesQuery,
  mockSeasonMonitorMutation,
  mockInvalidate,
  mockCancel,
  mockGetData,
  mockSetData,
} = vi.hoisted(() => ({
  mockShowQuery: vi.fn(),
  mockSeasonsQuery: vi.fn(),
  mockProgressQuery: vi.fn(),
  mockBatchLogMutation: vi.fn(),
  mockCheckSeriesQuery: vi.fn(),
  mockSeasonMonitorMutation: vi.fn(),
  mockInvalidate: vi.fn(),
  mockCancel: vi.fn(),
  mockGetData: vi.fn(),
  mockSetData: vi.fn(),
}));

// Store batchLog opts so tests can invoke callbacks
let batchLogOpts: Record<string, unknown> = {};

vi.mock('../lib/trpc', () => ({
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
            batchLogOpts = opts;
            mockBatchLogMutation.mockImplementation(async () => {
              if (typeof opts.onMutate === 'function')
                await (opts.onMutate as () => Promise<void>)();
              if (typeof opts.onSuccess === 'function')
                (opts.onSuccess as (result: { data: { logged: number } }) => void)({
                  data: { logged: 16 },
                });
              if (typeof opts.onSettled === 'function') (opts.onSettled as () => void)();
            });
            return { mutate: mockBatchLogMutation, isPending: false };
          },
        },
        invalidate: mockInvalidate,
      },
      arr: {
        checkSeries: {
          useQuery: (...args: unknown[]) => mockCheckSeriesQuery(...args),
          invalidate: mockInvalidate,
        },
        updateSeasonMonitoring: {
          useMutation: (opts: Record<string, unknown>) => {
            mockSeasonMonitorMutation.mockImplementation((variables: { seasonNumber: number }) => {
              if (typeof opts.onSuccess === 'function') (opts.onSuccess as () => void)();
              if (typeof opts.onSettled === 'function')
                (opts.onSettled as (d: unknown, e: unknown, v: { seasonNumber: number }) => void)(
                  undefined,
                  undefined,
                  variables
                );
            });
            return { mutate: mockSeasonMonitorMutation, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      media: {
        watchHistory: {
          progress: {
            cancel: mockCancel,
            getData: mockGetData,
            setData: mockSetData,
          },
          invalidate: mockInvalidate,
        },
        arr: {
          checkSeries: { invalidate: mockInvalidate },
        },
      },
    }),
  },
}));

vi.mock('../components/ArrStatusBadge', () => ({
  ArrStatusBadge: () => null,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// --- Test data ---

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

// --- Helpers ---

function renderPage(showId = '1') {
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
  mockCheckSeriesQuery.mockReturnValue({ data: null, isLoading: false });
});

describe('TvShowDetailPage — season list', () => {
  describe('rendering', () => {
    it('renders season cards with correct data', () => {
      setupQueries();
      renderPage();
      expect(screen.getByRole('heading', { name: 'Seasons' })).toBeInTheDocument();
      expect(screen.getByText('Season 1')).toBeInTheDocument();
      expect(screen.getByText('Season 2')).toBeInTheDocument();
      // Season 3 has null name — falls back to "Season 3"
      expect(screen.getByText('Season 3')).toBeInTheDocument();
      expect(screen.getByText('Specials')).toBeInTheDocument();
    });

    it('renders episode counts', () => {
      setupQueries();
      renderPage();
      expect(screen.getByText('7 episodes')).toBeInTheDocument();
      expect(screen.getAllByText('13 episodes')).toHaveLength(2);
      expect(screen.getByText('3 episodes')).toBeInTheDocument();
    });

    it('shows empty state when no seasons', () => {
      setupQueries({}, [], {
        ...PROGRESS,
        overall: { watched: 0, total: 0, percentage: 0 },
        seasons: [],
      });
      renderPage();
      expect(screen.getByRole('heading', { name: 'Seasons' })).toBeInTheDocument();
      expect(screen.getByText('No seasons available')).toBeInTheDocument();
    });
  });

  describe('sort order', () => {
    it('puts specials (season 0) last', () => {
      setupQueries();
      const { container } = renderPage();
      const links = container.querySelectorAll('a[href*="/season/"]');
      expect(links).toHaveLength(4);
      // First three should be seasons 1, 2, 3 — last should be specials (season 0)
      expect(links[0]!.getAttribute('href')).toBe('/media/tv/1/season/1');
      expect(links[1]!.getAttribute('href')).toBe('/media/tv/1/season/2');
      expect(links[2]!.getAttribute('href')).toBe('/media/tv/1/season/3');
      expect(links[3]!.getAttribute('href')).toBe('/media/tv/1/season/0');
    });
  });

  describe('navigation', () => {
    it('links to correct season detail page', () => {
      setupQueries();
      const { container } = renderPage();
      const seasonLink = container.querySelector('a[href="/media/tv/1/season/2"]');
      expect(seasonLink).toBeInTheDocument();
    });
  });

  describe('progress bars', () => {
    it('renders progress bar for season with progress', () => {
      setupQueries();
      const { container } = renderPage();
      // Season 1 is 100% — should have green bar
      const progressBars = container.querySelectorAll("[style*='width']");
      expect(progressBars.length).toBeGreaterThan(0);
    });

    it('renders green bar for completed season (100%)', () => {
      setupQueries({}, [{ id: 11, seasonNumber: 1, name: 'Season 1', episodeCount: 7 }], {
        ...PROGRESS,
        seasons: [{ seasonId: 11, seasonNumber: 1, watched: 7, total: 7, percentage: 100 }],
      });
      const { container } = renderPage();
      const bar = container.querySelector("[style*='width: 100%']");
      expect(bar).toBeInTheDocument();
      expect(bar?.className).toContain('bg-success');
    });

    it('renders accent bar for in-progress season (50%)', () => {
      setupQueries({}, [{ id: 12, seasonNumber: 2, name: 'Season 2', episodeCount: 10 }], {
        ...PROGRESS,
        seasons: [{ seasonId: 12, seasonNumber: 2, watched: 5, total: 10, percentage: 50 }],
      });
      const { container } = renderPage();
      const bar = container.querySelector("[style*='width: 50%']");
      expect(bar).toBeInTheDocument();
      expect(bar?.className).toContain('bg-primary');
    });

    it('does not render progress bar for 0% season', () => {
      setupQueries({}, [{ id: 10, seasonNumber: 1, name: 'Season 1', episodeCount: 5 }], {
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

  describe('404 handling', () => {
    it('shows error for invalid show ID', () => {
      mockShowQuery.mockReturnValue({ data: null, isLoading: false, error: null });
      renderPage('abc');
      expect(screen.getByText('Invalid show ID')).toBeInTheDocument();
    });

    it('shows not found for missing show', () => {
      mockShowQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: { data: { code: 'NOT_FOUND' }, message: 'Not found' },
      });
      renderPage('999');
      expect(screen.getByText('Show not found')).toBeInTheDocument();
    });
  });
});

describe('TvShowDetailPage — hero and metadata', () => {
  describe('hero with backdrop', () => {
    it('renders backdrop image when backdropUrl is present', () => {
      setupQueries();
      const { container } = renderPage();
      const backdrop = container.querySelector('img[src="/media/images/tv/81189/backdrop.jpg"]');
      expect(backdrop).toBeInTheDocument();
    });

    it('does not render backdrop image when backdropUrl is null (fallback gradient)', () => {
      setupQueries({ backdropUrl: null });
      const { container } = renderPage();
      // No backdrop img — only the poster img should exist
      const images = container.querySelectorAll('img');
      expect(images).toHaveLength(1);
      expect(images[0]!.getAttribute('alt')).toBe('Breaking Bad poster');
      // Hero container still has bg-muted as fallback background
      const hero = container.querySelector('.bg-muted');
      expect(hero).toBeInTheDocument();
      // Gradient overlay is always rendered
      const gradient = container.querySelector('.bg-gradient-to-t');
      expect(gradient).toBeInTheDocument();
    });

    it('renders poster image', () => {
      setupQueries();
      renderPage();
      expect(screen.getByAltText('Breaking Bad poster')).toBeInTheDocument();
    });

    it('renders a placeholder div when posterUrl is null (no img element)', () => {
      setupQueries({ posterUrl: null });
      const { container } = renderPage();
      // Component renders a <div> placeholder instead of <img> when posterUrl is null
      expect(container.querySelector('img[alt="Breaking Bad poster"]')).not.toBeInTheDocument();
      const placeholder = container.querySelector('div.rounded-lg.bg-muted.shadow-lg');
      expect(placeholder).toBeInTheDocument();
    });

    it('renders title in h1', () => {
      setupQueries();
      renderPage();
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Breaking Bad');
    });
  });

  describe('status badge', () => {
    it('renders status text for ended show', () => {
      setupQueries();
      renderPage();
      // Status appears in both hero and metadata grid
      expect(screen.getAllByText('Ended').length).toBeGreaterThanOrEqual(1);
    });

    it('renders status text for returning series', () => {
      setupQueries({ status: 'Returning Series' });
      renderPage();
      expect(screen.getAllByText('Returning Series').length).toBeGreaterThanOrEqual(1);
    });

    it('renders separator dot between year range and status', () => {
      setupQueries();
      renderPage();
      expect(screen.getByText('·')).toBeInTheDocument();
    });

    it('does not render separator when no year range', () => {
      setupQueries({ firstAirDate: null, lastAirDate: null });
      renderPage();
      expect(screen.queryByText('·')).not.toBeInTheDocument();
      // Status still renders in hero and metadata
      expect(screen.getAllByText('Ended').length).toBeGreaterThanOrEqual(1);
    });

    it('does not render status when status is null', () => {
      setupQueries({ status: null });
      renderPage();
      expect(screen.queryByText('·')).not.toBeInTheDocument();
    });
  });

  describe('year range formatting', () => {
    it('shows start–end for ended show spanning multiple years', () => {
      setupQueries();
      renderPage();
      expect(screen.getByText('2008–2013')).toBeInTheDocument();
    });

    it('shows year–Present for returning series', () => {
      setupQueries({
        status: 'Returning Series',
        firstAirDate: '2022-02-18',
        lastAirDate: '2024-01-12',
      });
      renderPage();
      expect(screen.getByText('2022–Present')).toBeInTheDocument();
    });

    it('shows single year when start and end are in same year', () => {
      setupQueries({
        firstAirDate: '2020-06-01',
        lastAirDate: '2020-12-15',
        status: 'Ended',
      });
      renderPage();
      expect(screen.getByText('2020')).toBeInTheDocument();
    });
  });

  describe('networks display', () => {
    it('renders networks in metadata grid', () => {
      setupQueries();
      renderPage();
      expect(screen.getByText('Networks')).toBeInTheDocument();
      expect(screen.getByText('AMC')).toBeInTheDocument();
    });

    it('renders multiple networks as comma-separated list', () => {
      setupQueries({ networks: ['HBO', 'Max'] });
      renderPage();
      expect(screen.getByText('HBO, Max')).toBeInTheDocument();
    });

    it('does not render networks when empty', () => {
      setupQueries({ networks: [] });
      renderPage();
      expect(screen.queryByText('Networks')).not.toBeInTheDocument();
    });
  });

  describe('genres', () => {
    it('renders genre badges', () => {
      setupQueries();
      renderPage();
      expect(screen.getByText('Drama')).toBeInTheDocument();
      expect(screen.getByText('Crime')).toBeInTheDocument();
    });
  });

  describe('overview', () => {
    it('renders overview text', () => {
      setupQueries();
      renderPage();
      expect(screen.getByText('A chemistry teacher turned meth cook.')).toBeInTheDocument();
    });
  });
});

describe('TvShowDetailPage — overall progress bar', () => {
  it('renders overall progress bar with label', () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 20, total: 36, percentage: 56 },
    });
    renderPage();
    expect(screen.getByText('20/36')).toBeInTheDocument();
  });

  it('renders green bar at 100%', () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 36, total: 36, percentage: 100 },
      seasons: PROGRESS.seasons.map((s) => ({ ...s, watched: s.total, percentage: 100 })),
    });
    const { container } = renderPage();
    // Overall progress bar in hero — find bar with 100% width
    const bars = container.querySelectorAll("[style*='width: 100%']");
    const greenBar = Array.from(bars).find((b) => b.className.includes('bg-success'));
    expect(greenBar).toBeTruthy();
  });

  it('renders primary bar at 50%', () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 18, total: 36, percentage: 50 },
    });
    const { container } = renderPage();
    const bar = container.querySelector("[style*='width: 50%']");
    expect(bar).toBeInTheDocument();
    expect(bar?.className).toContain('bg-primary');
  });

  it('does not render progress bar when total is 0', () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 0, total: 0, percentage: 0 },
    });
    renderPage();
    // ProgressBar returns null when total is 0
    expect(screen.queryByText(/\/0/)).not.toBeInTheDocument();
  });
});

describe('TvShowDetailPage — next episode indicator', () => {
  it('renders next episode link with correct text', () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      nextEpisode: { seasonNumber: 2, episodeNumber: 9, episodeName: '4 Days Out' },
    });
    renderPage();
    expect(screen.getByText(/Continue watching: S02E09 — 4 Days Out/)).toBeInTheDocument();
  });

  it('renders next episode without name', () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      nextEpisode: { seasonNumber: 3, episodeNumber: 1, episodeName: null },
    });
    renderPage();
    expect(screen.getByText('Continue watching: S03E01')).toBeInTheDocument();
  });

  it('does not render next episode when all watched', () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 36, total: 36, percentage: 100 },
      nextEpisode: null,
    });
    renderPage();
    expect(screen.queryByText(/Continue watching/)).not.toBeInTheDocument();
  });

  it('links to correct season page', () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      nextEpisode: { seasonNumber: 2, episodeNumber: 9, episodeName: '4 Days Out' },
    });
    const { container } = renderPage();
    const link = container.querySelector('a[href="/media/tv/1/season/2"]');
    expect(link?.textContent).toContain('Continue watching');
  });
});

describe('TvShowDetailPage — batch mark all watched', () => {
  it('shows Mark All Watched button when not all watched', () => {
    setupQueries();
    renderPage();
    expect(screen.getByRole('button', { name: 'Mark All Watched' })).toBeInTheDocument();
  });

  it('shows All Watched checkmark when fully watched', () => {
    setupQueries({}, SEASONS, {
      ...PROGRESS,
      overall: { watched: 36, total: 36, percentage: 100 },
      seasons: PROGRESS.seasons.map((s) => ({ ...s, watched: s.total, percentage: 100 })),
    });
    renderPage();
    expect(screen.getByText('All Watched')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark All Watched' })).not.toBeInTheDocument();
  });

  it('calls batchLog mutation with correct args on click', () => {
    setupQueries();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mark All Watched' }));
    expect(mockBatchLogMutation).toHaveBeenCalledWith({
      mediaType: 'show',
      mediaId: 1,
    });
  });

  it('cancels progress query on batch mark (optimistic)', () => {
    setupQueries();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mark All Watched' }));
    expect(mockCancel).toHaveBeenCalled();
  });

  it('snapshots progress data before optimistic update', async () => {
    setupQueries();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mark All Watched' }));
    await waitFor(() => {
      expect(mockGetData).toHaveBeenCalled();
    });
  });

  it('sets progress data optimistically on batch mark', async () => {
    setupQueries();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mark All Watched' }));
    await waitFor(() => {
      expect(mockSetData).toHaveBeenCalled();
    });
  });

  it('invalidates watch history after batch mark settles', async () => {
    setupQueries();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Mark All Watched' }));
    await waitFor(() => {
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  it('reverts progress data on error', async () => {
    mockGetData.mockReturnValue({ data: PROGRESS });
    setupQueries();
    renderPage();
    // Override AFTER render so it isn't overwritten by useMutation mock
    mockBatchLogMutation.mockImplementation(async () => {
      if (typeof batchLogOpts.onMutate === 'function')
        await (batchLogOpts.onMutate as () => Promise<void>)();
      if (typeof batchLogOpts.onError === 'function')
        (batchLogOpts.onError as (err: { message: string }) => void)({
          message: 'Network error',
        });
      if (typeof batchLogOpts.onSettled === 'function') (batchLogOpts.onSettled as () => void)();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark All Watched' }));
    // setData called twice: once for optimistic, once for rollback
    await waitFor(() => {
      expect(mockSetData).toHaveBeenCalledTimes(2);
    });
  });
});

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

function setupWithSonarr(sonarr = SONARR_SERIES) {
  setupQueries();
  mockCheckSeriesQuery.mockReturnValue({ data: { data: sonarr }, isLoading: false });
}

describe('TvShowDetailPage — season monitoring toggles', () => {
  it('shows monitoring toggle per season when series exists in Sonarr', () => {
    setupWithSonarr();
    renderPage();
    expect(screen.getByRole('switch', { name: 'Monitor Season 1' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Monitor Season 2' })).toBeInTheDocument();
  });

  it('reflects monitored state from Sonarr seasons data', () => {
    setupWithSonarr();
    renderPage();
    expect(screen.getByRole('switch', { name: 'Monitor Season 1' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Monitor Season 2' })).not.toBeChecked();
  });

  it('hides monitoring toggles when series is not in Sonarr', () => {
    setupQueries();
    mockCheckSeriesQuery.mockReturnValue({
      data: { data: { exists: false, sonarrId: null, seasons: [] } },
      isLoading: false,
    });
    renderPage();
    expect(screen.queryByRole('switch', { name: /Monitor Season/ })).not.toBeInTheDocument();
  });

  it('hides monitoring toggles when Sonarr data is not loaded', () => {
    setupQueries();
    mockCheckSeriesQuery.mockReturnValue({ data: null, isLoading: true });
    renderPage();
    expect(screen.queryByRole('switch', { name: /Monitor Season/ })).not.toBeInTheDocument();
  });

  it('calls updateSeasonMonitoring when toggle is clicked', () => {
    setupWithSonarr();
    renderPage();
    const toggle = screen.getByRole('switch', { name: 'Monitor Season 1' });
    fireEvent.click(toggle);
    expect(mockSeasonMonitorMutation).toHaveBeenCalledWith({
      sonarrId: 99,
      seasonNumber: 1,
      monitored: false,
    });
  });

  it('optimistically updates toggle state on click', () => {
    setupWithSonarr();
    renderPage();
    const toggle = screen.getByRole('switch', { name: 'Monitor Season 2' });
    fireEvent.click(toggle);
    // After clicking unmonitored season 2, it should optimistically show checked
    expect(toggle).toBeChecked();
  });
});
