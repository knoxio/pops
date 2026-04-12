import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarkAsWatchedButton } from './MarkAsWatchedButton';

// Capture mutation options
let logMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
let _deleteMutationOpts: Record<string, (...args: unknown[]) => unknown> = {};
const mockLogMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockWatchlistAddMutate = vi.fn();
const mockInvalidateHistory = vi.fn();
const mockInvalidateWatchlist = vi.fn();
const mockInvalidatePendingDebriefs = vi.fn();

const mockHistoryQuery = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      watchHistory: {
        list: {
          useQuery: (...args: unknown[]) => mockHistoryQuery(...args),
        },
        log: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            logMutationOpts = opts;
            return { mutate: mockLogMutate, isPending: false };
          },
        },
        delete: {
          useMutation: (opts: Record<string, (...args: unknown[]) => unknown>) => {
            _deleteMutationOpts = opts;
            return { mutate: mockDeleteMutate, isPending: false };
          },
        },
      },
      watchlist: {
        add: {
          useMutation: () => ({ mutate: mockWatchlistAddMutate, isPending: false }),
        },
      },
    },
    useUtils: () => ({
      media: {
        watchHistory: {
          list: { invalidate: mockInvalidateHistory },
        },
        watchlist: {
          list: { invalidate: mockInvalidateWatchlist },
        },
        comparisons: {
          getPendingDebriefs: { invalidate: mockInvalidatePendingDebriefs },
        },
      },
    }),
  },
}));

// Mock sonner
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

function setupEmpty() {
  mockHistoryQuery.mockReturnValue({
    data: { data: [], pagination: { total: 0 } },
    isLoading: false,
  });
}

function setupWatched(count = 1) {
  mockHistoryQuery.mockReturnValue({
    data: {
      data: Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        watchedAt: '2026-01-01T00:00:00Z',
      })),
    },
    isLoading: false,
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  logMutationOpts = {};
  _deleteMutationOpts = {};
  setupEmpty();
});

describe('MarkAsWatchedButton', () => {
  it("renders 'Mark as Watched' button for unwatched movie", () => {
    render(<MarkAsWatchedButton mediaId={550} />);
    expect(screen.getByLabelText('Mark as watched')).toBeInTheDocument();
    expect(screen.getByText('Mark as Watched')).toBeInTheDocument();
  });

  it('shows watched count when already watched', () => {
    setupWatched(2);
    render(<MarkAsWatchedButton mediaId={550} />);
    expect(screen.getByText('Watched (2)')).toBeInTheDocument();
  });

  it('calls log mutation with correct payload on click', () => {
    render(<MarkAsWatchedButton mediaId={550} />);

    fireEvent.click(screen.getByLabelText('Mark as watched'));

    expect(mockLogMutate).toHaveBeenCalledWith({
      mediaType: 'movie',
      mediaId: 550,
      completed: 1,
    });
  });

  it('shows success toast with Undo action on log success', () => {
    render(<MarkAsWatchedButton mediaId={550} />);

    logMutationOpts.onSuccess!({ data: { id: 99 }, watchlistRemoved: false });

    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Marked as watched',
      expect.objectContaining({
        duration: 5000,
        action: expect.objectContaining({ label: 'Undo' }),
      })
    );
  });

  it('invalidates watch history on log success', () => {
    render(<MarkAsWatchedButton mediaId={550} />);

    logMutationOpts.onSuccess!({ data: { id: 99 }, watchlistRemoved: false });

    expect(mockInvalidateHistory).toHaveBeenCalled();
  });

  it('shows error toast on log failure', () => {
    render(<MarkAsWatchedButton mediaId={550} />);

    logMutationOpts.onError!({ message: 'DB error' });

    expect(mockToastError).toHaveBeenCalledWith('Failed to log watch: DB error');
  });

  it('undo calls delete with entry ID', () => {
    render(<MarkAsWatchedButton mediaId={550} />);

    logMutationOpts.onSuccess!({ data: { id: 99 }, watchlistRemoved: false });

    const toastCall = mockToastSuccess.mock.calls[0];
    const opts = toastCall?.[1] as { action?: { onClick: () => void } };
    opts?.action?.onClick();

    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 99 }, expect.any(Object));
  });

  it('undo re-adds to watchlist when watchlistRemoved=true', () => {
    render(<MarkAsWatchedButton mediaId={550} />);

    logMutationOpts.onSuccess!({ data: { id: 99 }, watchlistRemoved: true });

    const toastCall = mockToastSuccess.mock.calls[0];
    const opts = toastCall?.[1] as { action?: { onClick: () => void } };
    opts?.action?.onClick();

    // Call the onSuccess of the delete mutation
    const deleteCall = mockDeleteMutate.mock.calls[0];
    const deleteOpts = deleteCall?.[1] as { onSuccess?: () => void };
    deleteOpts?.onSuccess?.();

    expect(mockWatchlistAddMutate).toHaveBeenCalledWith(
      { mediaType: 'movie', mediaId: 550 },
      expect.any(Object)
    );
  });

  it('undo does not re-add to watchlist when watchlistRemoved=false', () => {
    render(<MarkAsWatchedButton mediaId={550} />);

    logMutationOpts.onSuccess!({ data: { id: 99 }, watchlistRemoved: false });

    const toastCall = mockToastSuccess.mock.calls[0];
    const opts = toastCall?.[1] as { action?: { onClick: () => void } };
    opts?.action?.onClick();

    const deleteCall = mockDeleteMutate.mock.calls[0];
    const deleteOpts = deleteCall?.[1] as { onSuccess?: () => void };
    deleteOpts?.onSuccess?.();

    expect(mockWatchlistAddMutate).not.toHaveBeenCalled();
  });

  it('button remains usable after logging (can log multiple watches)', () => {
    setupWatched(1);
    render(<MarkAsWatchedButton mediaId={550} />);

    const button = screen.getByLabelText('Mark as watched');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(mockLogMutate).toHaveBeenCalledTimes(1);
  });
});
