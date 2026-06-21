import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const watchlistStatusMock = vi.hoisted(() => vi.fn());
const watchlistAddMock = vi.hoisted(() => vi.fn());
const watchlistRemoveMock = vi.hoisted(() => vi.fn());

vi.mock('../media-api/index.js', () => ({
  watchlistStatus: (...args: unknown[]) => watchlistStatusMock(...args),
  watchlistAdd: (...args: unknown[]) => watchlistAddMock(...args),
  watchlistRemove: (...args: unknown[]) => watchlistRemoveMock(...args),
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

import { WatchlistToggle } from './WatchlistToggle';

type WatchlistStatus = { onWatchlist: boolean; entryId: number | null };

function statusResult(data: WatchlistStatus) {
  return { data, error: undefined };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderToggle(
  props: { mediaType: 'movie' | 'tv'; mediaId: number },
  queryClient = makeQueryClient()
) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const view = render(<WatchlistToggle {...props} />, { wrapper });
  return { ...view, queryClient };
}

function setupNotOnWatchlist() {
  watchlistStatusMock.mockResolvedValue(statusResult({ onWatchlist: false, entryId: null }));
}

function setupOnWatchlist() {
  watchlistStatusMock.mockResolvedValue(statusResult({ onWatchlist: true, entryId: 42 }));
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  watchlistStatusMock.mockResolvedValue(statusResult({ onWatchlist: false, entryId: null }));
  watchlistAddMock.mockResolvedValue({
    data: { created: true, message: 'ok', data: { id: 1 } },
    error: undefined,
  });
  watchlistRemoveMock.mockResolvedValue({ data: { message: 'ok' }, error: undefined });
});

describe('WatchlistToggle', () => {
  describe('initial state', () => {
    it('shows loading button while checking watchlist', () => {
      watchlistStatusMock.mockReturnValue(new Promise(() => {}));
      renderToggle({ mediaType: 'movie', mediaId: 550 });

      expect(screen.getByLabelText('Checking watchlist status')).toBeInTheDocument();
    });

    it("shows 'Add to Watchlist' when not on watchlist", async () => {
      setupNotOnWatchlist();
      renderToggle({ mediaType: 'movie', mediaId: 550 });

      expect(await screen.findByText('Add to Watchlist')).toBeInTheDocument();
      expect(screen.getByLabelText('Add to watchlist')).toBeInTheDocument();
    });

    it("shows 'On Watchlist' when on watchlist", async () => {
      setupOnWatchlist();
      renderToggle({ mediaType: 'movie', mediaId: 550 });

      expect(await screen.findByText('On Watchlist')).toBeInTheDocument();
      expect(screen.getByLabelText('Remove from watchlist')).toBeInTheDocument();
    });
  });

  describe('add', () => {
    it('calls watchlistAdd on click when not on watchlist', async () => {
      setupNotOnWatchlist();
      const user = userEvent.setup();
      renderToggle({ mediaType: 'movie', mediaId: 550 });

      await user.click(await screen.findByRole('button', { name: 'Add to watchlist' }));

      await waitFor(() =>
        expect(watchlistAddMock).toHaveBeenCalledWith({
          body: { mediaType: 'movie', mediaId: 550 },
        })
      );
    });

    it('optimistically flips the status before the request resolves', async () => {
      setupNotOnWatchlist();
      let resolveAdd: ((value: unknown) => void) | undefined;
      watchlistAddMock.mockReturnValue(
        new Promise((resolve) => {
          resolveAdd = resolve;
        })
      );
      const user = userEvent.setup();
      const { queryClient } = renderToggle({ mediaType: 'movie', mediaId: 550 });

      await user.click(await screen.findByRole('button', { name: 'Add to watchlist' }));

      await waitFor(() =>
        expect(
          queryClient.getQueryData<WatchlistStatus>([
            'media',
            'watchlist',
            'status',
            { mediaType: 'movie', mediaId: 550 },
          ])
        ).toEqual({ onWatchlist: true, entryId: -1 })
      );
      resolveAdd?.({ data: { created: true, message: 'ok', data: { id: 1 } }, error: undefined });
    });

    it('shows a success toast when the add resolves', async () => {
      setupNotOnWatchlist();
      const user = userEvent.setup();
      renderToggle({ mediaType: 'movie', mediaId: 550 });

      await user.click(await screen.findByRole('button', { name: 'Add to watchlist' }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Added to watchlist'));
    });

    it('rolls back the optimistic status and toasts on error', async () => {
      setupNotOnWatchlist();
      watchlistAddMock.mockResolvedValue({
        data: undefined,
        error: { message: 'Server error' },
        response: { status: 500 },
      });
      const user = userEvent.setup();
      const { queryClient } = renderToggle({ mediaType: 'movie', mediaId: 550 });

      await user.click(await screen.findByRole('button', { name: 'Add to watchlist' }));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to add: Server error')
      );
      expect(
        queryClient.getQueryData<WatchlistStatus>([
          'media',
          'watchlist',
          'status',
          { mediaType: 'movie', mediaId: 550 },
        ])
      ).toEqual({ onWatchlist: false, entryId: null });
      expect(mockToastInfo).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('calls watchlistRemove with the entry id on click when on watchlist', async () => {
      setupOnWatchlist();
      const user = userEvent.setup();
      renderToggle({ mediaType: 'movie', mediaId: 550 });

      await user.click(await screen.findByRole('button', { name: 'Remove from watchlist' }));

      await waitFor(() => expect(watchlistRemoveMock).toHaveBeenCalledWith({ path: { id: 42 } }));
    });

    it('optimistically clears the status before the request resolves', async () => {
      setupOnWatchlist();
      let resolveRemove: ((value: unknown) => void) | undefined;
      watchlistRemoveMock.mockReturnValue(
        new Promise((resolve) => {
          resolveRemove = resolve;
        })
      );
      const user = userEvent.setup();
      const { queryClient } = renderToggle({ mediaType: 'movie', mediaId: 550 });

      await user.click(await screen.findByRole('button', { name: 'Remove from watchlist' }));

      await waitFor(() =>
        expect(
          queryClient.getQueryData<WatchlistStatus>([
            'media',
            'watchlist',
            'status',
            { mediaType: 'movie', mediaId: 550 },
          ])
        ).toEqual({ onWatchlist: false, entryId: null })
      );
      resolveRemove?.({ data: { message: 'ok' }, error: undefined });
    });

    it('shows a success toast when the remove resolves', async () => {
      setupOnWatchlist();
      const user = userEvent.setup();
      renderToggle({ mediaType: 'movie', mediaId: 550 });

      await user.click(await screen.findByRole('button', { name: 'Remove from watchlist' }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Removed from watchlist'));
    });

    it('rolls back the optimistic status and toasts on error', async () => {
      setupOnWatchlist();
      watchlistRemoveMock.mockResolvedValue({
        data: undefined,
        error: { message: 'Network error' },
        response: { status: 500 },
      });
      const user = userEvent.setup();
      const { queryClient } = renderToggle({ mediaType: 'movie', mediaId: 550 });

      await user.click(await screen.findByRole('button', { name: 'Remove from watchlist' }));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to remove: Network error')
      );
      expect(
        queryClient.getQueryData<WatchlistStatus>([
          'media',
          'watchlist',
          'status',
          { mediaType: 'movie', mediaId: 550 },
        ])
      ).toEqual({ onWatchlist: true, entryId: 42 });
    });
  });

  describe('media type conversion', () => {
    it("converts 'tv' to 'tv_show' for the status query", async () => {
      setupNotOnWatchlist();
      renderToggle({ mediaType: 'tv', mediaId: 100 });

      await waitFor(() =>
        expect(watchlistStatusMock).toHaveBeenCalledWith({
          query: { mediaType: 'tv_show', mediaId: 100 },
        })
      );
    });
  });
});
