import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WatchlistToggle } from './WatchlistToggle';

// Capture mutation options so we can call onMutate/onError/onSettled directly
let addMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
let removeMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
const mockAddMutate = vi.fn();
const mockRemoveMutate = vi.fn();
const mockInvalidate = vi.fn();
const mockCancel = vi.fn().mockResolvedValue(undefined);
const mockGetData = vi.fn();
const mockSetData = vi.fn();

const mockStatusQuery = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      watchlist: {
        status: {
          useQuery: (...args: unknown[]) => mockStatusQuery(...args),
        },
        add: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            addMutationOpts = opts;
            return { mutate: mockAddMutate, isPending: false };
          },
        },
        remove: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            removeMutationOpts = opts;
            return { mutate: mockRemoveMutate, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({
      media: {
        watchlist: {
          status: {
            invalidate: mockInvalidate,
            cancel: mockCancel,
            getData: mockGetData,
            setData: mockSetData,
          },
        },
      },
    }),
  },
}));

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

function setupNotOnWatchlist() {
  mockStatusQuery.mockReturnValue({
    data: { onWatchlist: false, entryId: null },
    isLoading: false,
  });
}

function setupOnWatchlist() {
  mockStatusQuery.mockReturnValue({
    data: { onWatchlist: true, entryId: 42 },
    isLoading: false,
  });
}

function setupLoading() {
  mockStatusQuery.mockReturnValue({
    data: undefined,
    isLoading: true,
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  addMutationOpts = {};
  removeMutationOpts = {};
});

describe('WatchlistToggle', () => {
  describe('initial state', () => {
    it('shows loading button while checking watchlist', () => {
      setupLoading();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      expect(screen.getByLabelText('Checking watchlist status')).toBeInTheDocument();
    });

    it("shows 'Add to Watchlist' when not on watchlist", () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      expect(screen.getByText('Add to Watchlist')).toBeInTheDocument();
      expect(screen.getByLabelText('Add to watchlist')).toBeInTheDocument();
    });

    it("shows 'On Watchlist' when on watchlist", () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      expect(screen.getByText('On Watchlist')).toBeInTheDocument();
      expect(screen.getByLabelText('Remove from watchlist')).toBeInTheDocument();
    });
  });

  describe('optimistic add', () => {
    it('calls addMutation.mutate on click when not on watchlist', async () => {
      setupNotOnWatchlist();
      const user = userEvent.setup();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      await user.click(screen.getByRole('button', { name: 'Add to watchlist' }));

      expect(mockAddMutate).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 550 });
    });

    it('onMutate cancels queries, snapshots cache, and sets optimistic state', async () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previousData = { onWatchlist: false, entryId: null };
      mockGetData.mockReturnValue(previousData);

      const context = await addMutationOpts.onMutate!();

      expect(mockCancel).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 550 });
      expect(mockGetData).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 550 });
      expect(mockSetData).toHaveBeenCalledWith(
        { mediaType: 'movie', mediaId: 550 },
        expect.any(Function)
      );
      expect(context).toEqual({ previous: previousData });

      // Verify the updater sets onWatchlist: true

      const updater = mockSetData.mock.calls[0]![1] as any;
      const result = updater(previousData);
      expect(result.onWatchlist).toBe(true);
    });

    it('onSuccess shows success toast', () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onSuccess!();

      expect(mockToastSuccess).toHaveBeenCalledWith('Added to watchlist');
    });

    it('onError rolls back cache and shows error toast', () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previous = { onWatchlist: false, entryId: null };
      addMutationOpts.onError!({ message: 'Server error', data: null }, {}, { previous });

      expect(mockSetData).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 550 }, previous);
      expect(mockToastError).toHaveBeenCalledWith('Failed to add: Server error');
    });

    it('onError shows info toast for CONFLICT (duplicate)', () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onError!(
        { message: 'Conflict', data: { code: 'CONFLICT' } },
        {},
        { previous: { onWatchlist: false, entryId: null } }
      );

      expect(mockToastInfo).toHaveBeenCalledWith('Already on watchlist');
    });

    it('onSettled invalidates the query', () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onSettled!();

      expect(mockInvalidate).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 550 });
    });
  });

  describe('optimistic remove', () => {
    it('calls removeMutation.mutate on click when on watchlist', async () => {
      setupOnWatchlist();
      const user = userEvent.setup();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      await user.click(screen.getByRole('button', { name: 'Remove from watchlist' }));

      expect(mockRemoveMutate).toHaveBeenCalledWith({ id: 42 });
    });

    it('onMutate cancels queries, snapshots cache, and clears status', async () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previousData = { onWatchlist: true, entryId: 42 };
      mockGetData.mockReturnValue(previousData);

      const context = await removeMutationOpts.onMutate!();

      expect(mockCancel).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 550 });
      expect(context).toEqual({ previous: previousData });

      // Verify the updater clears the status

      const updater = mockSetData.mock.calls[0]![1] as any;
      const result = updater(previousData);
      expect(result.onWatchlist).toBe(false);
      expect(result.entryId).toBeNull();
    });

    it('onSuccess shows success toast', () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      removeMutationOpts.onSuccess!();

      expect(mockToastSuccess).toHaveBeenCalledWith('Removed from watchlist');
    });

    it('onError rolls back cache and shows error toast', () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previous = { onWatchlist: true, entryId: 42 };
      removeMutationOpts.onError!({ message: 'Network error' }, {}, { previous });

      expect(mockSetData).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 550 }, previous);
      expect(mockToastError).toHaveBeenCalledWith('Failed to remove: Network error');
    });

    it('onSettled invalidates the query', () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      removeMutationOpts.onSettled!();

      expect(mockInvalidate).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 550 });
    });
  });

  describe('media type conversion', () => {
    it("converts 'tv' to 'tv_show' for API calls", () => {
      mockStatusQuery.mockReturnValue({
        data: { onWatchlist: false, entryId: null },
        isLoading: false,
      });
      render(<WatchlistToggle mediaType="tv" mediaId={100} />);

      expect(mockStatusQuery).toHaveBeenCalledWith(
        { mediaType: 'tv_show', mediaId: 100 },
        expect.any(Object)
      );
    });
  });
});
