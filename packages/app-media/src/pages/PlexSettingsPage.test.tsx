import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetSyncStatus = vi.fn();
const mockGetPlexUrl = vi.fn();
const mockGetSectionIds = vi.fn();
const mockGetSchedulerStatus = vi.fn();
const mockGetSyncLogs = vi.fn();
const mockTestConnection = vi.fn();
const mockGetLibraries = vi.fn();
const mockSaveSectionIdsMutate = vi.fn();
const mockSaveUrlMutate = vi.fn();
const mockGetPinMutate = vi.fn();
const mockCheckPinMutate = vi.fn();
const mockDisconnectMutate = vi.fn();
const mockStartSchedulerMutate = vi.fn();
const mockStopSchedulerMutate = vi.fn();

let getPinOpts: Record<string, unknown> = {};

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** Per-job-type sync state, controlled via `setSyncJobState`. */
const syncJobStates: Record<
  string,
  {
    start: ReturnType<typeof vi.fn>;
    isStarting: boolean;
    isRunning: boolean;
    progress: { processed: number; total: number } | null;
    result: unknown;
    error: string | null;
    durationMs: number | null;
    completedAt: string | null;
    status: 'idle' | 'running' | 'completed' | 'failed';
  }
> = {};

function defaultSyncJobState() {
  return {
    start: vi.fn(),
    isStarting: false,
    isRunning: false,
    progress: null,
    result: null,
    error: null,
    durationMs: null,
    completedAt: null,
    status: 'idle' as const,
  };
}

function setSyncJobState(jobType: string, overrides: Record<string, unknown>) {
  syncJobStates[jobType] = { ...defaultSyncJobState(), ...overrides };
}

vi.mock('../hooks/useSyncJob', () => ({
  useSyncJob: (jobType: string) => syncJobStates[jobType] ?? defaultSyncJobState(),
}));

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      plex: {
        getSyncStatus: {
          useQuery: (...args: unknown[]) => mockGetSyncStatus(...args),
        },
        getPlexUrl: {
          useQuery: (...args: unknown[]) => mockGetPlexUrl(...args),
        },
        getSectionIds: {
          useQuery: (...args: unknown[]) => mockGetSectionIds(...args),
        },
        getSchedulerStatus: {
          useQuery: (...args: unknown[]) => mockGetSchedulerStatus(...args),
        },
        getSyncLogs: {
          useQuery: (...args: unknown[]) => mockGetSyncLogs(...args),
        },
        testConnection: {
          useQuery: (...args: unknown[]) => mockTestConnection(...args),
        },
        getLibraries: {
          useQuery: (...args: unknown[]) => mockGetLibraries(...args),
        },
        saveSectionIds: {
          useMutation: () => ({
            mutate: mockSaveSectionIdsMutate,
            isPending: false,
          }),
        },
        setUrl: {
          useMutation: () => ({
            mutate: mockSaveUrlMutate,
            isPending: false,
            error: null,
          }),
        },
        getAuthPin: {
          useMutation: (opts: Record<string, unknown>) => {
            getPinOpts = opts;
            return {
              mutate: mockGetPinMutate,
              isPending: false,
              error: null,
            };
          },
        },
        checkAuthPin: {
          useMutation: () => ({
            mutate: mockCheckPinMutate,
            isPending: false,
          }),
        },
        disconnect: {
          useMutation: () => ({
            mutate: mockDisconnectMutate,
            isPending: false,
          }),
        },
        startScheduler: {
          useMutation: () => ({
            mutate: mockStartSchedulerMutate,
            isPending: false,
          }),
        },
        stopScheduler: {
          useMutation: () => ({
            mutate: mockStopSchedulerMutate,
            isPending: false,
          }),
        },
      },
    },
  },
}));

import { PlexSettingsPage } from './PlexSettingsPage';

// ── Helpers ────────────────────────────────────────────────────────────────

function setupDefaults(
  overrides: {
    configured?: boolean;
    hasToken?: boolean;
    hasUrl?: boolean;
    connected?: boolean;
    libraries?: { key: string; title: string; type: string }[];
    schedulerRunning?: boolean;
    schedulerIntervalMs?: number;
  } = {}
) {
  const {
    configured = true,
    hasToken = true,
    hasUrl = true,
    connected = true,
    libraries = [
      { key: '1', title: 'Movies', type: 'movie' },
      { key: '2', title: 'TV Shows', type: 'show' },
    ],
    schedulerRunning = false,
    schedulerIntervalMs = 21600000,
  } = overrides;

  mockGetSyncStatus.mockReturnValue({
    isLoading: false,
    data: { data: { configured, hasToken, hasUrl } },
  });
  mockGetPlexUrl.mockReturnValue({
    isLoading: false,
    data: { data: hasUrl ? 'http://192.168.1.100:32400' : null },
  });
  mockGetSectionIds.mockReturnValue({
    data: { data: { movieSectionId: '1', tvSectionId: '2' } },
  });
  mockGetSchedulerStatus.mockReturnValue({
    data: {
      data: {
        isRunning: schedulerRunning,
        intervalMs: schedulerIntervalMs,
        lastSyncAt: null,
        lastSyncError: null,
        nextSyncAt: null,
        moviesSynced: 0,
        tvShowsSynced: 0,
      },
    },
    refetch: vi.fn(),
  });
  mockGetSyncLogs.mockReturnValue({
    data: { data: [] },
    refetch: vi.fn(),
  });
  mockTestConnection.mockReturnValue({
    data: { data: { connected } },
    refetch: vi.fn(),
  });
  mockGetLibraries.mockReturnValue({
    data: { data: libraries },
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PlexSettingsPage />
    </MemoryRouter>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  getPinOpts = {};
  // Reset all sync job states
  for (const key of Object.keys(syncJobStates)) {
    delete syncJobStates[key];
  }
});

describe('PlexSettingsPage', () => {
  it('shows loading skeleton when data is loading', () => {
    mockGetSyncStatus.mockReturnValue({ isLoading: true });
    mockGetPlexUrl.mockReturnValue({ isLoading: true });
    mockGetSectionIds.mockReturnValue({ data: null });
    mockGetSchedulerStatus.mockReturnValue({ data: null });
    mockGetSyncLogs.mockReturnValue({ data: null });
    mockTestConnection.mockReturnValue({ data: null });
    mockGetLibraries.mockReturnValue({ data: null });

    renderPage();
    // Skeletons are rendered (no page header visible)
    expect(screen.queryByText('Plex Settings')).not.toBeInTheDocument();
  });

  it('renders URL input and save button', () => {
    setupDefaults({ connected: false, hasToken: false, configured: false, hasUrl: false });
    renderPage();

    expect(screen.getByPlaceholderText('http://192.168.1.100:32400')).toBeInTheDocument();
    expect(screen.getByText('Server Configuration')).toBeInTheDocument();
  });

  it('shows PIN code prominently during auth flow', () => {
    setupDefaults({ hasToken: false, configured: false });
    renderPage();

    // Click connect
    const connectBtn = screen.getByText('Connect to Plex');
    expect(connectBtn).toBeInTheDocument();
    fireEvent.click(connectBtn);
    expect(mockGetPinMutate).toHaveBeenCalled();

    // Simulate PIN success callback inside act so state updates flush
    const onSuccess = getPinOpts.onSuccess as (res: {
      data: { id: number; code: string; clientId: string };
    }) => void;
    act(() => {
      onSuccess({ data: { id: 123, code: 'ABCD', clientId: 'test-client' } });
    });

    // PIN code should be visible
    expect(screen.getByText('ABCD')).toBeInTheDocument();
  });

  it('shows plex.tv/link URL during PIN auth', () => {
    setupDefaults({ hasToken: false, configured: false });
    renderPage();

    // Trigger PIN flow
    fireEvent.click(screen.getByText('Connect to Plex'));
    const onSuccess = getPinOpts.onSuccess as (res: {
      data: { id: number; code: string; clientId: string };
    }) => void;
    act(() => {
      onSuccess({ data: { id: 123, code: 'WXYZ', clientId: 'test' } });
    });

    // The link should be present
    const link = screen.getByText('plex.tv/link');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', 'https://plex.tv/link');
  });

  it('renders movie and TV library selects when connected', () => {
    setupDefaults();
    renderPage();

    expect(screen.getByLabelText('Select movie library')).toBeInTheDocument();
    expect(screen.getByLabelText('Select TV library')).toBeInTheDocument();
  });

  it('displays inline sync results after movie sync', () => {
    setupDefaults();
    setSyncJobState('syncMovies', {
      status: 'completed',
      result: {
        synced: 5,
        skipped: 2,
        errors: [{ title: 'Bad Movie', reason: 'TMDB not found', year: 2020 }],
      },
    });
    renderPage();

    expect(screen.getByText('Movie Results:')).toBeInTheDocument();
    expect(screen.getByText('5 synced')).toBeInTheDocument();
    expect(screen.getByText('2 skipped')).toBeInTheDocument();
    expect(screen.getByText('1 errors')).toBeInTheDocument();
  });

  it('displays inline sync results after TV sync', () => {
    setupDefaults();
    setSyncJobState('syncTvShows', {
      status: 'completed',
      result: { synced: 3, skipped: 1, errors: [] },
    });
    renderPage();

    expect(screen.getByText('TV Results:')).toBeInTheDocument();
    expect(screen.getByText('3 synced')).toBeInTheDocument();
  });

  it('shows expandable error details for sync errors', () => {
    setupDefaults();
    setSyncJobState('syncMovies', {
      status: 'completed',
      result: {
        synced: 1,
        skipped: 0,
        errors: [{ title: 'Broken Film', reason: 'No TMDB match', year: null }],
      },
    });
    renderPage();

    // Click show errors
    const showBtn = screen.getByText('Show error details');
    fireEvent.click(showBtn);

    expect(screen.getByText(/Broken Film/)).toBeInTheDocument();
    expect(screen.getByText(/No TMDB match/)).toBeInTheDocument();
  });

  it('renders scheduler section with start button when not running', () => {
    setupDefaults({ schedulerRunning: false });
    renderPage();

    expect(screen.getByText('Auto Sync Scheduler')).toBeInTheDocument();
    expect(screen.getByText('Start Scheduler')).toBeInTheDocument();
    expect(screen.getByText('Scheduler off')).toBeInTheDocument();
  });

  it('renders scheduler with stop button when running', () => {
    setupDefaults({ schedulerRunning: true, schedulerIntervalMs: 21600000 });
    renderPage();

    expect(screen.getByText('Stop Scheduler')).toBeInTheDocument();
    expect(screen.getByText(/Scheduler active/)).toBeInTheDocument();
  });

  it('calls startScheduler with correct interval', () => {
    setupDefaults({ schedulerRunning: false });
    renderPage();

    const input = screen.getByLabelText('Sync every') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12' } });

    fireEvent.click(screen.getByText('Start Scheduler'));
    expect(mockStartSchedulerMutate).toHaveBeenCalledWith({
      intervalMs: 12 * 60 * 60 * 1000,
      movieSectionId: '1',
      tvSectionId: '2',
    });
  });

  it('shows disconnect button when has token', () => {
    setupDefaults({ hasToken: true });
    renderPage();

    const btn = screen.getByText('Disconnect');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(mockDisconnectMutate).toHaveBeenCalled();
  });

  it('shows connection error when test fails', () => {
    setupDefaults();
    mockTestConnection.mockReturnValue({
      data: { data: { connected: false, error: 'Connection refused' } },
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText('Connection Failed')).toBeInTheDocument();
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  // ── Watchlist Sync ──────────────────────────────────────────────────────

  it('shows Watchlist Sync section when connected', () => {
    setupDefaults();
    renderPage();

    expect(screen.getByText('Watchlist Sync')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sync watchlist/i })).toBeInTheDocument();
  });

  it('hides Watchlist Sync section when not connected', () => {
    setupDefaults({ connected: false, hasToken: false, configured: false });
    renderPage();

    expect(screen.queryByText('Watchlist Sync')).not.toBeInTheDocument();
  });

  it('triggers syncWatchlist start on button click', () => {
    const mockStart = vi.fn();
    setSyncJobState('syncWatchlist', { start: mockStart });
    setupDefaults();
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /sync watchlist/i }));
    expect(mockStart).toHaveBeenCalledOnce();
  });

  it('displays watchlist sync results after successful sync', () => {
    setupDefaults();
    setSyncJobState('syncWatchlist', {
      status: 'completed',
      result: { added: 3, removed: 1, skipped: 5, errors: [] },
    });
    renderPage();

    expect(screen.getByText('Watchlist Results:')).toBeInTheDocument();
    expect(screen.getByText('3 added')).toBeInTheDocument();
    expect(screen.getByText('1 removed')).toBeInTheDocument();
    expect(screen.getByText('5 skipped')).toBeInTheDocument();
  });

  it('shows expandable error details for watchlist sync errors', () => {
    setupDefaults();
    setSyncJobState('syncWatchlist', {
      status: 'completed',
      result: {
        added: 1,
        removed: 0,
        skipped: 0,
        errors: [{ title: 'Unknown Movie', reason: 'No TMDB match found' }],
      },
    });
    renderPage();

    expect(screen.getByText('1 errors')).toBeInTheDocument();
    // Errors hidden initially
    expect(screen.queryByText(/No TMDB match found/)).not.toBeInTheDocument();

    // Expand errors — the watchlist section's "Show error details" is the only one visible
    const showBtn = screen.getByText('Show error details');
    fireEvent.click(showBtn);

    expect(screen.getByText(/Unknown Movie:/)).toBeInTheDocument();
    expect(screen.getByText(/No TMDB match found/)).toBeInTheDocument();

    // Collapse
    const hideBtn = screen.getByText('Hide error details');
    fireEvent.click(hideBtn);
    expect(screen.queryByText(/No TMDB match found/)).not.toBeInTheDocument();
  });
});
