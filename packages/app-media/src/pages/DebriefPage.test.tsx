import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@pops/ui';

// ── Mocks ──

const mockDebriefQuery = vi.fn();
const mockWatchlistQuery = vi.fn();
const mockListForMediaQuery = vi.fn();
const mockRecordMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockDismissMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockAddToWatchlistMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockRemoveFromWatchlistMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockMarkStaleMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockExcludeMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};
const mockBlacklistMutate = vi.fn() as ReturnType<typeof vi.fn> & {
  _opts?: Record<string, unknown>;
};

const mockInvalidateDebrief = vi.fn();
const mockInvalidatePending = vi.fn();
const mockInvalidateWatchlist = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      comparisons: {
        getDebrief: {
          useQuery: (...args: unknown[]) => {
            const result = mockDebriefQuery(...args);
            return { ...result, refetch: vi.fn() };
          },
        },
        recordDebriefComparison: {
          useMutation: (opts: Record<string, unknown>) => {
            mockRecordMutate._opts = opts;
            return { mutate: mockRecordMutate, isPending: false };
          },
        },
        dismissDebriefDimension: {
          useMutation: (opts: Record<string, unknown>) => {
            mockDismissMutate._opts = opts;
            return { mutate: mockDismissMutate, isPending: false };
          },
        },
        markStale: {
          useMutation: (opts: Record<string, unknown>) => {
            mockMarkStaleMutate._opts = opts;
            return { mutate: mockMarkStaleMutate, isPending: false };
          },
        },
        excludeFromDimension: {
          useMutation: () => {
            return { mutate: mockExcludeMutate, isPending: false };
          },
        },
        blacklistMovie: {
          useMutation: (opts: Record<string, unknown>) => {
            mockBlacklistMutate._opts = opts;
            return { mutate: mockBlacklistMutate, isPending: false };
          },
        },
        listForMedia: {
          useQuery: (...args: unknown[]) => mockListForMediaQuery(...args),
        },
      },
      watchlist: {
        list: {
          useQuery: (...args: unknown[]) => mockWatchlistQuery(...args),
        },
        add: {
          useMutation: (opts: Record<string, unknown>) => {
            mockAddToWatchlistMutate._opts = opts;
            return { mutate: mockAddToWatchlistMutate, isPending: false };
          },
        },
        remove: {
          useMutation: (opts: Record<string, unknown>) => {
            mockRemoveFromWatchlistMutate._opts = opts;
            return { mutate: mockRemoveFromWatchlistMutate, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      media: {
        comparisons: {
          getDebrief: { invalidate: mockInvalidateDebrief },
          getPendingDebriefs: { invalidate: mockInvalidatePending },
        },
        watchlist: {
          list: { invalidate: mockInvalidateWatchlist },
        },
      },
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { DebriefPage } from './DebriefPage';

// ── Helpers ──

function renderWithMovie(movieId: string) {
  return render(
    <MemoryRouter initialEntries={[`/media/debrief/${movieId}`]}>
      <TooltipProvider>
        <Routes>
          <Route path="/media/debrief/:movieId" element={<DebriefPage />} />
        </Routes>
      </TooltipProvider>
    </MemoryRouter>
  );
}

/** Renders the debrief page with a catch-all route that exposes the
 *  current pathname so post-navigation assertions can be made. */
function renderWithMovieAndSpy(movieId: string) {
  function PathDisplay() {
    const loc = useLocation();
    return <div data-testid="current-path">{loc.pathname}</div>;
  }
  return render(
    <MemoryRouter initialEntries={[`/media/debrief/${movieId}`]}>
      <TooltipProvider>
        <Routes>
          <Route path="/media/debrief/:movieId" element={<DebriefPage />} />
          <Route path="*" element={<PathDisplay />} />
        </Routes>
      </TooltipProvider>
    </MemoryRouter>
  );
}

const mockDebrief = {
  sessionId: 42,
  status: 'active',
  movie: {
    mediaType: 'movie',
    mediaId: 10,
    title: 'Inception',
    posterPath: '/poster.jpg',
    posterUrl: '/media/images/movie/27205/poster.jpg',
  },
  dimensions: [
    {
      dimensionId: 1,
      name: 'Story',
      status: 'pending',
      comparisonId: null,
      opponent: {
        id: 20,
        title: 'The Matrix',
        posterPath: '/matrix.jpg',
        posterUrl: '/media/images/movie/603/poster.jpg',
      },
    },
    {
      dimensionId: 2,
      name: 'Visuals',
      status: 'pending',
      comparisonId: null,
      opponent: {
        id: 30,
        title: 'Avatar',
        posterPath: '/avatar.jpg',
        posterUrl: '/media/images/movie/19995/poster.jpg',
      },
    },
  ],
};

const completedDebrief = {
  ...mockDebrief,
  status: 'complete',
  dimensions: [
    {
      dimensionId: 1,
      name: 'Story',
      status: 'complete',
      comparisonId: 100,
      opponent: null,
    },
    {
      dimensionId: 2,
      name: 'Visuals',
      status: 'complete',
      comparisonId: null,
      opponent: null,
    },
  ],
};

/** Set up all three queries in a standard active-debrief state. */
function setupActiveDebrief() {
  mockDebriefQuery.mockReturnValue({
    data: { data: mockDebrief },
    isLoading: false,
    error: null,
  });
  mockWatchlistQuery.mockReturnValue({ data: { data: [] } });
  mockListForMediaQuery.mockReturnValue({ data: { pagination: { total: 3 } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default watchlist and listForMedia stubs so they don't throw
  mockWatchlistQuery.mockReturnValue({ data: { data: [] } });
  mockListForMediaQuery.mockReturnValue({ data: null });
});

// ── Tests ──

describe('DebriefPage', () => {
  it('shows loading skeleton while fetching', () => {
    mockDebriefQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderWithMovie('42');
    expect(screen.getByTestId('debrief-loading')).toBeInTheDocument();
  });

  it('renders movie title and poster header', () => {
    setupActiveDebrief();
    renderWithMovie('42');

    expect(screen.getByRole('heading', { name: 'Inception', level: 1 })).toBeInTheDocument();
    const header = screen.getByTestId('debrief-header');
    expect(header).toBeInTheDocument();
    expect(header.querySelector('img')).toHaveAttribute('alt', 'Inception poster');
  });

  it('renders dimension progress badges', () => {
    setupActiveDebrief();
    renderWithMovie('42');

    const progress = screen.getByTestId('dimension-progress');
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveTextContent('Story');
    expect(progress).toHaveTextContent('Visuals');
  });

  it('renders comparison cards with movie and opponent', () => {
    setupActiveDebrief();
    renderWithMovie('42');

    expect(screen.getByTestId('comparison-cards')).toBeInTheDocument();
    expect(screen.getByLabelText('Pick Inception')).toBeInTheDocument();
    expect(screen.getByLabelText('Pick The Matrix')).toBeInTheDocument();
    expect(screen.getByText('The Matrix')).toBeInTheDocument();
  });

  it('calls recordDebriefComparison when picking movie A', () => {
    setupActiveDebrief();
    renderWithMovie('42');

    fireEvent.click(screen.getByLabelText('Pick Inception'));
    expect(mockRecordMutate).toHaveBeenCalledWith({
      sessionId: 42,
      dimensionId: 1,
      opponentType: 'movie',
      opponentId: 20,
      winnerId: 10,
    });
  });

  it('calls recordDebriefComparison when picking opponent (movie B)', () => {
    setupActiveDebrief();
    renderWithMovie('42');

    fireEvent.click(screen.getByLabelText('Pick The Matrix'));
    expect(mockRecordMutate).toHaveBeenCalledWith({
      sessionId: 42,
      dimensionId: 1,
      opponentType: 'movie',
      opponentId: 20,
      winnerId: 20,
    });
  });

  it('calls recordDebriefComparison with winnerId=0 for draw', () => {
    setupActiveDebrief();
    renderWithMovie('42');

    fireEvent.click(screen.getByTestId('draw-mid'));
    expect(mockRecordMutate).toHaveBeenCalledWith({
      sessionId: 42,
      dimensionId: 1,
      opponentType: 'movie',
      opponentId: 20,
      winnerId: 0,
      drawTier: 'mid',
    });
  });

  it('calls dismissDebriefDimension when skip button clicked', () => {
    setupActiveDebrief();
    renderWithMovie('42');

    fireEvent.click(screen.getByTestId('skip-dimension-btn'));
    expect(mockDismissMutate).toHaveBeenCalledWith({
      sessionId: 42,
      dimensionId: 1,
    });
  });

  it('shows completion summary when all dimensions are complete', () => {
    mockDebriefQuery.mockReturnValue({
      data: { data: completedDebrief },
      isLoading: false,
      error: null,
    });
    renderWithMovie('42');

    expect(screen.getByTestId('completion-summary')).toBeInTheDocument();
    expect(screen.getByText('Debrief Complete')).toBeInTheDocument();
    expect(screen.queryByTestId('comparison-cards')).not.toBeInTheDocument();
  });

  it('shows error state when session not found', () => {
    mockDebriefQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Session not found' },
    });
    renderWithMovie('999');

    expect(screen.getByTestId('debrief-error')).toBeInTheDocument();
    expect(screen.getByText('Could not load debrief')).toBeInTheDocument();
  });

  it('shows invalid movie message for non-numeric ID', () => {
    mockDebriefQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
    renderWithMovie('abc');

    expect(screen.getByText('Invalid movie ID.')).toBeInTheDocument();
  });

  it('"Do another" button navigates to /media/compare', async () => {
    const user = userEvent.setup();
    mockDebriefQuery.mockReturnValue({
      data: { data: completedDebrief },
      isLoading: false,
      error: null,
    });
    renderWithMovieAndSpy('42');

    // The completion summary shows when all dimensions are done
    expect(screen.getByTestId('completion-summary')).toBeInTheDocument();
    await user.click(screen.getByText('Do another'));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/media/compare');
  });
});

// ── Action button tests ──

describe('DebriefPage — action buttons', () => {
  describe('watchlist toggle', () => {
    it('renders watchlist button for movie A (debrief movie)', () => {
      setupActiveDebrief();
      renderWithMovie('42');
      // mediaId=10 is the debrief movie
      expect(screen.getByTestId('watchlist-button-10')).toBeInTheDocument();
    });

    it('renders watchlist button for movie B (opponent)', () => {
      setupActiveDebrief();
      renderWithMovie('42');
      // opponent id=20
      expect(screen.getByTestId('watchlist-button-20')).toBeInTheDocument();
    });

    it('calls add mutation when movie A is not on watchlist', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('watchlist-button-10'));
      expect(mockAddToWatchlistMutate).toHaveBeenCalledWith({
        mediaType: 'movie',
        mediaId: 10,
      });
    });

    it('calls remove mutation when movie A is already on watchlist', async () => {
      mockDebriefQuery.mockReturnValue({
        data: { data: mockDebrief },
        isLoading: false,
        error: null,
      });
      // mediaId 10 is on watchlist with entry id 99
      mockWatchlistQuery.mockReturnValue({
        data: { data: [{ mediaType: 'movie', mediaId: 10, id: 99 }] },
      });
      mockListForMediaQuery.mockReturnValue({ data: null });

      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('watchlist-button-10'));
      expect(mockRemoveFromWatchlistMutate).toHaveBeenCalledWith({ id: 99 });
    });

    it('shows "Remove from watchlist" label when movie is on watchlist', () => {
      mockDebriefQuery.mockReturnValue({
        data: { data: mockDebrief },
        isLoading: false,
        error: null,
      });
      mockWatchlistQuery.mockReturnValue({
        data: { data: [{ mediaType: 'movie', mediaId: 10, id: 99 }] },
      });
      mockListForMediaQuery.mockReturnValue({ data: null });

      renderWithMovie('42');
      expect(screen.getByLabelText('Remove Inception from watchlist')).toBeInTheDocument();
    });

    it('shows "Add to watchlist" label when movie is not on watchlist', () => {
      setupActiveDebrief();
      renderWithMovie('42');
      expect(screen.getByLabelText('Add Inception to watchlist')).toBeInTheDocument();
    });
  });

  describe('mark stale', () => {
    it('renders stale button for movie A', () => {
      setupActiveDebrief();
      renderWithMovie('42');
      expect(screen.getByTestId('stale-button-10')).toBeInTheDocument();
    });

    it('renders stale button for movie B', () => {
      setupActiveDebrief();
      renderWithMovie('42');
      expect(screen.getByTestId('stale-button-20')).toBeInTheDocument();
    });

    it('calls markStale mutation for movie A', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('stale-button-10'));
      expect(mockMarkStaleMutate).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 10 });
    });

    it('calls markStale mutation for movie B (opponent)', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('stale-button-20'));
      expect(mockMarkStaleMutate).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 20 });
    });
  });

  describe('N/A exclusion', () => {
    it('renders N/A button for both cards', () => {
      setupActiveDebrief();
      renderWithMovie('42');
      expect(screen.getByTestId('na-button-10')).toBeInTheDocument();
      expect(screen.getByTestId('na-button-20')).toBeInTheDocument();
    });

    it('calls excludeFromDimension for movie A with current dimensionId', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('na-button-10'));
      expect(mockExcludeMutate).toHaveBeenCalledWith(
        { mediaType: 'movie', mediaId: 10, dimensionId: 1 },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });

    it('calls excludeFromDimension for movie B with current dimensionId', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('na-button-20'));
      expect(mockExcludeMutate).toHaveBeenCalledWith(
        { mediaType: 'movie', mediaId: 20, dimensionId: 1 },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });
  });

  describe('blacklist (not watched)', () => {
    it('renders blacklist button for both cards', () => {
      setupActiveDebrief();
      renderWithMovie('42');
      expect(screen.getByTestId('blacklist-button-10')).toBeInTheDocument();
      expect(screen.getByTestId('blacklist-button-20')).toBeInTheDocument();
    });

    it('opens confirmation dialog when blacklist button clicked for movie A', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('blacklist-button-10'));
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });
      expect(screen.getByText('Mark as not watched?')).toBeInTheDocument();
    });

    it('calls blacklistMovie mutation when confirmed', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('blacklist-button-10'));
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Not watched'));
      expect(mockBlacklistMutate).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 10 });
    });

    it('closes dialog on cancel without calling blacklistMovie', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('blacklist-button-10'));
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Cancel'));
      expect(mockBlacklistMutate).not.toHaveBeenCalled();
    });
  });

  describe('winner-pick unaffected by action buttons', () => {
    it('does not call recordMutation when watchlist button clicked', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('watchlist-button-10'));
      expect(mockRecordMutate).not.toHaveBeenCalled();
    });

    it('does not call recordMutation when stale button clicked', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('stale-button-10'));
      expect(mockRecordMutate).not.toHaveBeenCalled();
    });

    it('does not call recordMutation when N/A button clicked', async () => {
      setupActiveDebrief();
      const user = userEvent.setup();
      renderWithMovie('42');

      await user.click(screen.getByTestId('na-button-10'));
      expect(mockRecordMutate).not.toHaveBeenCalled();
    });
  });
});
