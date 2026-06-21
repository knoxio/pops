import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const watchHistoryListMock = vi.hoisted(() => vi.fn());
const watchHistoryLogMock = vi.hoisted(() => vi.fn());
const watchHistoryDeleteMock = vi.hoisted(() => vi.fn());
const watchlistAddMock = vi.hoisted(() => vi.fn());

vi.mock('../media-api/index.js', () => ({
  watchHistoryList: (...args: unknown[]) => watchHistoryListMock(...args),
  watchHistoryLog: (...args: unknown[]) => watchHistoryLogMock(...args),
  watchHistoryDelete: (...args: unknown[]) => watchHistoryDeleteMock(...args),
  watchlistAdd: (...args: unknown[]) => watchlistAddMock(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { MarkAsWatchedButton } from './MarkAsWatchedButton';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderButton(mediaId = 550) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<MarkAsWatchedButton mediaId={mediaId} />, { wrapper });
}

function setupEmpty() {
  watchHistoryListMock.mockResolvedValue(ok({ data: [], pagination: { total: 0 } }));
}

function setupWatched(count = 1) {
  watchHistoryListMock.mockResolvedValue(
    ok({
      data: Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        watchedAt: '2026-01-01T00:00:00Z',
      })),
      pagination: { total: count },
    })
  );
}

/** Invokes the Undo action handed to the success toast. */
function triggerUndo() {
  const toastCall = mockToastSuccess.mock.calls.find(([msg]) => msg === 'Marked as watched');
  const opts = toastCall?.[1] as { action?: { onClick: () => void } } | undefined;
  opts?.action?.onClick();
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  setupEmpty();
  watchHistoryLogMock.mockResolvedValue(
    ok({ data: { id: 99 }, message: 'ok', watchlistRemoved: false })
  );
  watchHistoryDeleteMock.mockResolvedValue(ok({}));
  watchlistAddMock.mockResolvedValue(ok({ created: true, message: 'ok', data: { id: 1 } }));
});

describe('MarkAsWatchedButton', () => {
  it("renders 'Mark as Watched' button for unwatched movie", async () => {
    renderButton();
    expect(await screen.findByLabelText('Mark as watched')).toBeInTheDocument();
    expect(screen.getByText('Mark as Watched')).toBeInTheDocument();
  });

  it('shows watched count when already watched', async () => {
    setupWatched(2);
    renderButton();
    expect(await screen.findByText('Watched (2)')).toBeInTheDocument();
  });

  it('calls log mutation with correct payload on click', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(await screen.findByLabelText('Mark as watched'));

    await waitFor(() =>
      expect(watchHistoryLogMock).toHaveBeenCalledWith({
        body: {
          mediaType: 'movie',
          mediaId: 550,
          completed: 1,
          source: 'manual',
          watchedAt: undefined,
        },
      })
    );
  });

  it('shows success toast with Undo action on log success', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(await screen.findByLabelText('Mark as watched'));

    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith(
        'Marked as watched',
        expect.objectContaining({
          duration: 5000,
          action: expect.objectContaining({ label: 'Undo' }),
        })
      )
    );
  });

  it('invalidates watch history on log success', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(await screen.findByLabelText('Mark as watched'));

    // Re-fetch of the history list is the observable effect of invalidation.
    await waitFor(() => expect(watchHistoryListMock.mock.calls.length).toBeGreaterThan(1));
  });

  it('shows error toast on log failure', async () => {
    watchHistoryLogMock.mockResolvedValue({
      data: undefined,
      error: { message: 'DB error' },
      response: { status: 500 },
    });
    const user = userEvent.setup();
    renderButton();

    await user.click(await screen.findByLabelText('Mark as watched'));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Failed to log watch: DB error')
    );
  });

  it('undo calls delete with entry ID', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(await screen.findByLabelText('Mark as watched'));
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Marked as watched', expect.anything())
    );
    triggerUndo();

    await waitFor(() => expect(watchHistoryDeleteMock).toHaveBeenCalledWith({ path: { id: 99 } }));
  });

  it('undo re-adds to watchlist when watchlistRemoved=true', async () => {
    watchHistoryLogMock.mockResolvedValue(
      ok({ data: { id: 99 }, message: 'ok', watchlistRemoved: true })
    );
    const user = userEvent.setup();
    renderButton();

    await user.click(await screen.findByLabelText('Mark as watched'));
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Marked as watched', expect.anything())
    );
    triggerUndo();

    await waitFor(() =>
      expect(watchlistAddMock).toHaveBeenCalledWith({
        body: { mediaType: 'movie', mediaId: 550 },
      })
    );
  });

  it('undo does not re-add to watchlist when watchlistRemoved=false', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(await screen.findByLabelText('Mark as watched'));
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Marked as watched', expect.anything())
    );
    triggerUndo();

    await waitFor(() => expect(watchHistoryDeleteMock).toHaveBeenCalled());
    expect(watchlistAddMock).not.toHaveBeenCalled();
  });

  it('button remains usable after logging (can log multiple watches)', async () => {
    setupWatched(1);
    const user = userEvent.setup();
    renderButton();

    const button = await screen.findByLabelText('Mark as watched');
    expect(button).not.toBeDisabled();
    await user.click(button);
    await waitFor(() => expect(watchHistoryLogMock).toHaveBeenCalledTimes(1));
  });
});
