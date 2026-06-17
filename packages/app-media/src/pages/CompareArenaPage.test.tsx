import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@pops/ui';

const mockDimensionsQuery = vi.fn();
const mockPairQuery = vi.fn();
const mockRefetchPair = vi.fn();
const mockPageInvalidate = vi.fn();

const mockComparisonsRecord = vi.fn();
const mockComparisonsRecordSkip = vi.fn();
const mockComparisonsMarkStale = vi.fn();
const mockComparisonsExcludeFromDimension = vi.fn();
const mockComparisonsBlacklistMovie = vi.fn();
const mockComparisonsListForMedia = vi.fn();
const mockComparisonsScores = vi.fn();
const mockWatchlistList = vi.fn();
const mockWatchlistAdd = vi.fn();
const mockWatchlistRemove = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'comparisons.listDimensions') return mockDimensionsQuery(input);
    if (key === 'comparisons.getSmartPair') {
      const result = mockPairQuery(input);
      return { ...result, refetch: mockRefetchPair };
    }
    return { data: undefined, isLoading: false, error: null };
  },
  usePillarUtils: () => ({
    setData: vi.fn(),
    invalidate: (path?: readonly string[]) => {
      mockPageInvalidate(path?.join('.') ?? '');
      return Promise.resolve();
    },
    fetchQuery: vi.fn(),
  }),
}));

vi.mock('../media-api/index.js', () => ({
  comparisonsRecord: (opts: unknown) => mockComparisonsRecord(opts),
  comparisonsRecordSkip: (opts: unknown) => mockComparisonsRecordSkip(opts),
  comparisonsMarkStale: (opts: unknown) => mockComparisonsMarkStale(opts),
  comparisonsExcludeFromDimension: (opts: unknown) => mockComparisonsExcludeFromDimension(opts),
  comparisonsBlacklistMovie: (opts: unknown) => mockComparisonsBlacklistMovie(opts),
  comparisonsListForMedia: (opts: unknown) => mockComparisonsListForMedia(opts),
  comparisonsScores: (opts: unknown) => mockComparisonsScores(opts),
  watchlistList: (opts: unknown) => mockWatchlistList(opts),
  watchlistAdd: (opts: unknown) => mockWatchlistAdd(opts),
  watchlistRemove: (opts: unknown) => mockWatchlistRemove(opts),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock('../components/DimensionManager', () => ({
  DimensionManager: () => <button>Manage Dimensions</button>,
}));

import { CompareArenaPage } from './CompareArenaPage';

const dim1 = { id: 1, name: 'Cinematography', active: true, description: null, sortOrder: 0 };
const dim2 = { id: 2, name: 'Entertainment', active: true, description: null, sortOrder: 1 };
const dim3 = { id: 3, name: 'Soundtrack', active: true, description: null, sortOrder: 2 };

const movieA = { id: 10, title: 'The Matrix', posterPath: null, posterUrl: null };
const movieB = { id: 20, title: 'Inception', posterPath: null, posterUrl: null };

function renderPage(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, null, createElement(TooltipProvider, null, children))
    );
  return render(<CompareArenaPage />, { wrapper });
}

function setupArena() {
  mockDimensionsQuery.mockReturnValue({
    data: { data: [dim1, dim2, dim3] },
    isLoading: false,
  });
  mockPairQuery.mockReturnValue({
    data: { data: { movieA, movieB, dimensionId: 1 } },
    isLoading: false,
    error: null,
  });
}

describe('CompareArenaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWatchlistList.mockResolvedValue({ data: { data: [] } });
    mockComparisonsListForMedia.mockResolvedValue({ data: null });
    mockComparisonsRecord.mockResolvedValue({ data: { data: {} } });
    mockComparisonsRecordSkip.mockResolvedValue({ data: {} });
    mockComparisonsMarkStale.mockResolvedValue({ data: { data: { staleness: 0.5 } } });
    mockComparisonsExcludeFromDimension.mockResolvedValue({ data: { comparisonsDeleted: 0 } });
    mockComparisonsBlacklistMovie.mockResolvedValue({ data: { data: {} } });
    mockComparisonsScores.mockResolvedValue({ data: { data: [] } });
    mockWatchlistAdd.mockResolvedValue({ data: { data: {} } });
    mockWatchlistRemove.mockResolvedValue({ data: {} });
  });

  it('renders pair with movie titles', () => {
    setupArena();
    renderPage();

    expect(screen.getAllByText('The Matrix').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inception').length).toBeGreaterThan(0);
  });

  it('renders dimension dropdown with active dimension selected', () => {
    setupArena();
    renderPage();

    const select = screen.getByLabelText('Comparison dimension');
    expect(select).toBeTruthy();
    expect((select as HTMLSelectElement).value).toBe('1');
  });

  it('calls record mutation when picking a winner', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getAllByText('The Matrix')[0]!);

    await waitFor(() => {
      expect(mockComparisonsRecord).toHaveBeenCalledWith({
        body: expect.objectContaining({
          dimensionId: 1,
          mediaAId: 10,
          mediaBId: 20,
          winnerId: 10,
        }),
      });
    });
  });

  it('skip button calls recordSkip mutation', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Skip this pair'));

    await waitFor(() => {
      expect(mockComparisonsRecordSkip).toHaveBeenCalledWith({
        body: {
          dimensionId: 1,
          mediaAType: 'movie',
          mediaAId: 10,
          mediaBType: 'movie',
          mediaBId: 20,
        },
      });
    });
    expect(mockComparisonsRecord).not.toHaveBeenCalled();
  });

  it('shows minimum threshold message when pair data is null', () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [dim1] },
      isLoading: false,
    });
    mockPairQuery.mockReturnValue({
      data: { data: null },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getByText('Not enough watched movies')).toBeTruthy();
  });

  it('shows watchlist depletion message when pool is empty and movies are watchlisted', () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [dim1] },
      isLoading: false,
    });
    mockPairQuery.mockReturnValue({
      data: { data: null },
      isLoading: false,
      error: null,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['media', 'watchlist', 'list', { mediaType: 'movie' }], {
      data: [
        { id: 1, mediaType: 'movie', mediaId: 10, title: 'The Matrix', addedAt: '2026-01-01' },
      ],
    });

    renderPage(queryClient);

    expect(screen.getByText('Not enough movies')).toBeTruthy();
    expect(screen.getByText('Some are on your watchlist.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View watchlist' })).toBeTruthy();
  });

  it('calls record mutation with correct dimension', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getAllByText('The Matrix')[0]!);

    await waitFor(() => {
      expect(mockComparisonsRecord).toHaveBeenCalledWith({
        body: expect.objectContaining({ dimensionId: 1 }),
      });
    });
  });

  it('watchlist button calls watchlist add without comparison side effects', async () => {
    setupArena();
    renderPage();

    const bookmarkButtons = screen.getAllByRole('button', { name: /add .* to watchlist/i });
    expect(bookmarkButtons.length).toBeGreaterThan(0);
    fireEvent.click(bookmarkButtons[0]!);

    await waitFor(() => {
      expect(mockWatchlistAdd).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 10 },
      });
    });

    expect(mockComparisonsRecord).not.toHaveBeenCalled();
    expect(mockRefetchPair).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('The Matrix added to watchlist');
    });
    expect(mockRefetchPair).not.toHaveBeenCalled();
    expect(mockComparisonsRecord).not.toHaveBeenCalled();
  });

  it('renders loading skeletons when pair is loading', () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [dim1] },
      isLoading: false,
    });
    mockPairQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
    });

    renderPage();

    expect(screen.queryByText('The Matrix')).toBeNull();
    expect(screen.queryByText('Not enough watched movies')).toBeNull();
  });

  it('renders loading skeletons when pair is fetching (background refetch)', () => {
    mockDimensionsQuery.mockReturnValue({
      data: { data: [dim1] },
      isLoading: false,
    });
    mockPairQuery.mockReturnValue({
      data: { data: { movieA, movieB, dimensionId: 1 } },
      isLoading: false,
      isFetching: true,
      error: null,
    });

    renderPage();

    expect(screen.queryByText('The Matrix')).toBeNull();
    expect(screen.queryByText('Not enough watched movies')).toBeNull();
  });

  it('renders stale buttons for both movies', () => {
    setupArena();
    renderPage();

    expect(screen.getByLabelText('Mark The Matrix as stale')).toBeTruthy();
    expect(screen.getByLabelText('Mark Inception as stale')).toBeTruthy();
  });

  it('calls markStale mutation when clicking stale button for movie A', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Mark The Matrix as stale'));

    await waitFor(() => {
      expect(mockComparisonsMarkStale).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 10 },
      });
    });
  });

  it('calls markStale mutation when clicking stale button for movie B', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Mark Inception as stale'));

    await waitFor(() => {
      expect(mockComparisonsMarkStale).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 20 },
      });
    });
  });

  it('does not record a comparison when marking stale', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Mark The Matrix as stale'));

    await waitFor(() => {
      expect(mockComparisonsMarkStale).toHaveBeenCalled();
    });
    expect(mockComparisonsRecord).not.toHaveBeenCalled();
  });

  it('N/A button for movie A calls excludeFromDimension with movie A id only', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('N/A: The Matrix'));

    await waitFor(() => {
      expect(mockComparisonsExcludeFromDimension).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 10, dimensionId: 1 },
      });
    });
    expect(mockComparisonsRecord).not.toHaveBeenCalled();
  });

  it('N/A button for movie B calls excludeFromDimension with movie B id only', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('N/A: Inception'));

    await waitFor(() => {
      expect(mockComparisonsExcludeFromDimension).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 20, dimensionId: 1 },
      });
    });
    expect(mockComparisonsRecord).not.toHaveBeenCalled();
  });

  it('renders Not Watched buttons on both cards', () => {
    setupArena();
    renderPage();

    expect(screen.getByLabelText('Not watched The Matrix')).toBeTruthy();
    expect(screen.getByLabelText('Not watched Inception')).toBeTruthy();
  });

  it('opens confirmation dialog when Not Watched button is clicked', () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Not watched The Matrix'));

    expect(screen.getByText('Mark as not watched?')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not watched' })).toBeTruthy();
  });

  it('shows comparison count in confirmation dialog', async () => {
    setupArena();
    mockComparisonsListForMedia.mockResolvedValue({
      data: { data: [], pagination: { total: 5 } },
    });
    renderPage();

    fireEvent.click(screen.getByLabelText('Not watched The Matrix'));

    expect(await screen.findByText('5')).toBeTruthy();
    expect(screen.getByText(/comparisons involving/)).toBeTruthy();
  });

  it('calls blacklistMovie mutation on confirm', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Not watched Inception'));
    fireEvent.click(screen.getByRole('button', { name: 'Not watched' }));

    await waitFor(() => {
      expect(mockComparisonsBlacklistMovie).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 20 },
      });
    });
  });

  it('closes dialog on cancel without calling blacklist', () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Not watched The Matrix'));
    expect(screen.getByText('Mark as not watched?')).toBeTruthy();

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockComparisonsBlacklistMovie).not.toHaveBeenCalled();
  });

  it('renders draw tier buttons with tooltips', () => {
    setupArena();
    renderPage();

    expect(screen.getByLabelText('Equally great')).toBeTruthy();
    expect(screen.getByLabelText('Equally average')).toBeTruthy();
    expect(screen.getByLabelText('Equally poor')).toBeTruthy();
  });

  it('draw high button records comparison with drawTier high', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Equally great'));

    await waitFor(() => {
      expect(mockComparisonsRecord).toHaveBeenCalledWith({
        body: expect.objectContaining({
          dimensionId: 1,
          mediaAId: 10,
          mediaBId: 20,
          winnerId: 0,
          drawTier: 'high',
        }),
      });
    });
  });

  it('draw mid button records comparison with drawTier mid', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Equally average'));

    await waitFor(() => {
      expect(mockComparisonsRecord).toHaveBeenCalledWith({
        body: expect.objectContaining({
          winnerId: 0,
          drawTier: 'mid',
        }),
      });
    });
  });

  it('draw low button records comparison with drawTier low', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Equally poor'));

    await waitFor(() => {
      expect(mockComparisonsRecord).toHaveBeenCalledWith({
        body: expect.objectContaining({
          winnerId: 0,
          drawTier: 'low',
        }),
      });
    });
  });

  it('draw buttons do not record a winner', async () => {
    setupArena();
    renderPage();

    fireEvent.click(screen.getByLabelText('Equally great'));

    await waitFor(() => {
      expect(mockComparisonsRecord).toHaveBeenCalledTimes(1);
    });
    expect(mockComparisonsRecord).toHaveBeenCalledWith({
      body: expect.objectContaining({ winnerId: 0 }),
    });
  });

  it('renders history link in header', () => {
    setupArena();
    renderPage();

    expect(screen.getByLabelText('Comparison history')).toBeTruthy();
  });
});
