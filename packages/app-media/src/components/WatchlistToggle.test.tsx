import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WatchlistToggle } from './WatchlistToggle';

type MutationOpts = Record<string, (...args: unknown[]) => unknown>;

let addMutationOpts: MutationOpts = {};
let removeMutationOpts: MutationOpts = {};
const mockAddMutate = vi.fn();
const mockRemoveMutate = vi.fn();
const mockInvalidate = vi.fn();
const mockSetData = vi.fn();
const mockStatusQuery = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    if (path.join('.') === 'watchlist.status') return mockStatusQuery(input);
    return { data: undefined, isLoading: false };
  },
  usePillarMutation: (_pillarId: string, path: readonly string[], opts: MutationOpts) => {
    const key = path.join('.');
    if (key === 'watchlist.add') {
      addMutationOpts = opts;
      return { mutate: mockAddMutate, isPending: false };
    }
    if (key === 'watchlist.remove') {
      removeMutationOpts = opts;
      return { mutate: mockRemoveMutate, isPending: false };
    }
    return { mutate: vi.fn(), isPending: false };
  },
  usePillarUtils: () => ({
    setData: mockSetData,
    invalidate: mockInvalidate,
  }),
}));

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

    it('onMutate writes optimistic state via utils.setData and returns previous snapshot', () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previousData = { onWatchlist: false, entryId: null };
      mockSetData.mockReturnValueOnce(previousData);

      const context = addMutationOpts.onMutate!();

      expect(mockSetData).toHaveBeenCalledWith(
        ['watchlist', 'status'],
        { mediaType: 'movie', mediaId: 550 },
        expect.any(Function)
      );
      expect(context).toEqual({ previous: previousData });

      const updater = mockSetData.mock.calls[0]![2] as (prev: unknown) => { onWatchlist: boolean };
      expect(updater(previousData).onWatchlist).toBe(true);
    });

    it('onSuccess shows success toast', () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onSuccess!();

      expect(mockToastSuccess).toHaveBeenCalledWith('Added to watchlist');
    });

    it('onError rolls back cache via setData and shows error toast', () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previous = { onWatchlist: false, entryId: null };
      addMutationOpts.onError!({ message: 'Server error' }, {}, { previous });

      const rollbackCall = mockSetData.mock.calls.at(-1)!;
      expect(rollbackCall[0]).toEqual(['watchlist', 'status']);
      expect(rollbackCall[1]).toEqual({ mediaType: 'movie', mediaId: 550 });
      const rollbackUpdater = rollbackCall[2] as (prev: unknown) => unknown;
      expect(rollbackUpdater(undefined)).toEqual(previous);
      expect(mockToastError).toHaveBeenCalledWith('Failed to add: Server error');
    });

    it('onError without a context skips rollback and still toasts error', () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onError!({ message: 'Boom' }, {}, undefined);

      expect(mockSetData).not.toHaveBeenCalled();
      expect(mockToastError).toHaveBeenCalledWith('Failed to add: Boom');
    });

    it('onSettled invalidates the watchlist.status router slice', () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onSettled!();

      expect(mockInvalidate).toHaveBeenCalledWith(['watchlist', 'status']);
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

    it('onMutate writes cleared status via setData and returns previous snapshot', () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      const previousData = { onWatchlist: true, entryId: 42 };
      mockSetData.mockReturnValueOnce(previousData);

      const context = removeMutationOpts.onMutate!();

      expect(mockSetData).toHaveBeenCalledWith(
        ['watchlist', 'status'],
        { mediaType: 'movie', mediaId: 550 },
        expect.any(Function)
      );
      expect(context).toEqual({ previous: previousData });

      const updater = mockSetData.mock.calls[0]![2] as (prev: unknown) => {
        onWatchlist: boolean;
        entryId: number | null;
      };
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

      const rollbackCall = mockSetData.mock.calls.at(-1)!;
      expect(rollbackCall[0]).toEqual(['watchlist', 'status']);
      expect(rollbackCall[1]).toEqual({ mediaType: 'movie', mediaId: 550 });
      const rollbackUpdater = rollbackCall[2] as (prev: unknown) => unknown;
      expect(rollbackUpdater(undefined)).toEqual(previous);
      expect(mockToastError).toHaveBeenCalledWith('Failed to remove: Network error');
    });

    it('onSettled invalidates the watchlist.status router slice', () => {
      setupOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      removeMutationOpts.onSettled!();

      expect(mockInvalidate).toHaveBeenCalledWith(['watchlist', 'status']);
    });
  });

  describe('media type conversion', () => {
    it("converts 'tv' to 'tv_show' for API calls", () => {
      mockStatusQuery.mockReturnValue({
        data: { onWatchlist: false, entryId: null },
        isLoading: false,
      });
      render(<WatchlistToggle mediaType="tv" mediaId={100} />);

      expect(mockStatusQuery).toHaveBeenCalledWith({ mediaType: 'tv_show', mediaId: 100 });
    });
  });

  describe('info toast', () => {
    it('does not surface info toast (CONFLICT branch removed in SDK migration)', () => {
      setupNotOnWatchlist();
      render(<WatchlistToggle mediaType="movie" mediaId={550} />);

      addMutationOpts.onError!(
        { message: 'Conflict' },
        {},
        { previous: { onWatchlist: false, entryId: null } }
      );

      expect(mockToastInfo).not.toHaveBeenCalled();
    });
  });
});
