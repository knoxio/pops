import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@pops/ui';

const mockComparisonsListDimensions = vi.fn();
const mockComparisonsGetSmartPair = vi.fn();

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

vi.mock('../media-api/index.js', () => ({
  comparisonsListDimensions: () => mockComparisonsListDimensions(),
  comparisonsGetSmartPair: (opts: unknown) => mockComparisonsGetSmartPair(opts),
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
  mockComparisonsListDimensions.mockResolvedValue({ data: { data: [dim1, dim2, dim3] } });
  mockComparisonsGetSmartPair.mockResolvedValue({
    data: { data: { movieA, movieB, dimensionId: 1 } },
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

  it('renders pair with movie titles', async () => {
    setupArena();
    renderPage();

    expect((await screen.findAllByText('The Matrix')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inception').length).toBeGreaterThan(0);
  });

  it('renders dimension dropdown with active dimension selected', async () => {
    setupArena();
    renderPage();

    const select = await screen.findByLabelText('Comparison dimension');
    expect(select).toBeTruthy();
    expect((select as HTMLSelectElement).value).toBe('1');
  });

  it('calls record mutation when picking a winner', async () => {
    setupArena();
    renderPage();

    fireEvent.click((await screen.findAllByText('The Matrix'))[0]!);

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

    fireEvent.click(await screen.findByLabelText('Skip this pair'));

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

  it('shows minimum threshold message when pair data is null', async () => {
    mockComparisonsListDimensions.mockResolvedValue({ data: { data: [dim1] } });
    mockComparisonsGetSmartPair.mockResolvedValue({
      data: { data: null, reason: 'insufficient_watched_movies' },
    });

    renderPage();

    expect(await screen.findByText('Not enough watched movies')).toBeTruthy();
  });

  it('shows watchlist depletion message when pool is empty and movies are watchlisted', async () => {
    mockComparisonsListDimensions.mockResolvedValue({ data: { data: [dim1] } });
    mockComparisonsGetSmartPair.mockResolvedValue({
      data: { data: null, reason: 'insufficient_watched_movies' },
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

    expect(await screen.findByText('Not enough movies')).toBeTruthy();
    expect(screen.getByText('Some are on your watchlist.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View watchlist' })).toBeTruthy();
  });

  it('calls record mutation with correct dimension', async () => {
    setupArena();
    renderPage();

    fireEvent.click((await screen.findAllByText('The Matrix'))[0]!);

    await waitFor(() => {
      expect(mockComparisonsRecord).toHaveBeenCalledWith({
        body: expect.objectContaining({ dimensionId: 1 }),
      });
    });
  });

  it('watchlist button calls watchlist add without comparison side effects', async () => {
    setupArena();
    renderPage();

    const bookmarkButtons = await screen.findAllByRole('button', {
      name: /add .* to watchlist/i,
    });
    expect(bookmarkButtons.length).toBeGreaterThan(0);
    fireEvent.click(bookmarkButtons[0]!);

    await waitFor(() => {
      expect(mockWatchlistAdd).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 10 },
      });
    });

    expect(mockComparisonsRecord).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('The Matrix added to watchlist');
    });
    expect(mockComparisonsRecord).not.toHaveBeenCalled();
  });

  it('renders loading skeletons when pair is loading', () => {
    mockComparisonsListDimensions.mockResolvedValue({ data: { data: [dim1] } });
    mockComparisonsGetSmartPair.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.queryByText('The Matrix')).toBeNull();
    expect(screen.queryByText('Not enough watched movies')).toBeNull();
  });

  it('renders loading skeletons when pair is fetching (background refetch)', () => {
    mockComparisonsListDimensions.mockResolvedValue({ data: { data: [dim1] } });
    mockComparisonsGetSmartPair.mockReturnValue(new Promise(() => {}));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(['media', 'comparisons', 'listDimensions'], {
      data: [dim1],
    });
    queryClient.setQueryData(['media', 'comparisons', 'getSmartPair', { dimensionId: null }], {
      data: { movieA, movieB, dimensionId: 1 },
    });

    renderPage(queryClient);

    expect(screen.queryByText('The Matrix')).toBeNull();
    expect(screen.queryByText('Not enough watched movies')).toBeNull();
  });

  it('renders stale buttons for both movies', async () => {
    setupArena();
    renderPage();

    expect(await screen.findByLabelText('Mark The Matrix as stale')).toBeTruthy();
    expect(screen.getByLabelText('Mark Inception as stale')).toBeTruthy();
  });

  it('calls markStale mutation when clicking stale button for movie A', async () => {
    setupArena();
    renderPage();

    fireEvent.click(await screen.findByLabelText('Mark The Matrix as stale'));

    await waitFor(() => {
      expect(mockComparisonsMarkStale).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 10 },
      });
    });
  });

  it('calls markStale mutation when clicking stale button for movie B', async () => {
    setupArena();
    renderPage();

    fireEvent.click(await screen.findByLabelText('Mark Inception as stale'));

    await waitFor(() => {
      expect(mockComparisonsMarkStale).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 20 },
      });
    });
  });

  it('does not record a comparison when marking stale', async () => {
    setupArena();
    renderPage();

    fireEvent.click(await screen.findByLabelText('Mark The Matrix as stale'));

    await waitFor(() => {
      expect(mockComparisonsMarkStale).toHaveBeenCalled();
    });
    expect(mockComparisonsRecord).not.toHaveBeenCalled();
  });

  it('N/A button for movie A calls excludeFromDimension with movie A id only', async () => {
    setupArena();
    renderPage();

    fireEvent.click(await screen.findByLabelText('N/A: The Matrix'));

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

    fireEvent.click(await screen.findByLabelText('N/A: Inception'));

    await waitFor(() => {
      expect(mockComparisonsExcludeFromDimension).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 20, dimensionId: 1 },
      });
    });
    expect(mockComparisonsRecord).not.toHaveBeenCalled();
  });

  it('renders Not Watched buttons on both cards', async () => {
    setupArena();
    renderPage();

    expect(await screen.findByLabelText('Not watched The Matrix')).toBeTruthy();
    expect(screen.getByLabelText('Not watched Inception')).toBeTruthy();
  });

  it('opens confirmation dialog when Not Watched button is clicked', async () => {
    setupArena();
    renderPage();

    fireEvent.click(await screen.findByLabelText('Not watched The Matrix'));

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

    fireEvent.click(await screen.findByLabelText('Not watched The Matrix'));

    expect(await screen.findByText('5')).toBeTruthy();
    expect(screen.getByText(/comparisons involving/)).toBeTruthy();
  });

  it('calls blacklistMovie mutation on confirm', async () => {
    setupArena();
    renderPage();

    fireEvent.click(await screen.findByLabelText('Not watched Inception'));
    fireEvent.click(screen.getByRole('button', { name: 'Not watched' }));

    await waitFor(() => {
      expect(mockComparisonsBlacklistMovie).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 20 },
      });
    });
  });

  it('closes dialog on cancel without calling blacklist', async () => {
    setupArena();
    renderPage();

    fireEvent.click(await screen.findByLabelText('Not watched The Matrix'));
    expect(screen.getByText('Mark as not watched?')).toBeTruthy();

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockComparisonsBlacklistMovie).not.toHaveBeenCalled();
  });

  it('renders draw tier buttons with tooltips', async () => {
    setupArena();
    renderPage();

    expect(await screen.findByLabelText('Equally great')).toBeTruthy();
    expect(screen.getByLabelText('Equally average')).toBeTruthy();
    expect(screen.getByLabelText('Equally poor')).toBeTruthy();
  });

  it('draw high button records comparison with drawTier high', async () => {
    setupArena();
    renderPage();

    fireEvent.click(await screen.findByLabelText('Equally great'));

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

    fireEvent.click(await screen.findByLabelText('Equally average'));

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

    fireEvent.click(await screen.findByLabelText('Equally poor'));

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

    fireEvent.click(await screen.findByLabelText('Equally great'));

    await waitFor(() => {
      expect(mockComparisonsRecord).toHaveBeenCalledTimes(1);
    });
    expect(mockComparisonsRecord).toHaveBeenCalledWith({
      body: expect.objectContaining({ winnerId: 0 }),
    });
  });

  it('renders history link in header', async () => {
    setupArena();
    renderPage();

    expect(await screen.findByLabelText('Comparison history')).toBeTruthy();
  });
});
