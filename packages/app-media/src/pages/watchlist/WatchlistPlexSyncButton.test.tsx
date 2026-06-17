import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { plexGetActiveSyncJobsMock, plexGetSyncJobStatusMock, plexStartSyncJobMock } = vi.hoisted(
  () => ({
    plexGetActiveSyncJobsMock: vi.fn(),
    plexGetSyncJobStatusMock: vi.fn(),
    plexStartSyncJobMock: vi.fn(),
  })
);

vi.mock('../../media-api/index.js', () => ({
  plexGetActiveSyncJobs: (...args: unknown[]) => plexGetActiveSyncJobsMock(...args),
  plexGetSyncJobStatus: (...args: unknown[]) => plexGetSyncJobStatusMock(...args),
  plexStartSyncJob: (...args: unknown[]) => plexStartSyncJobMock(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { WatchlistPlexSyncButton } from './WatchlistPlexSyncButton';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<WatchlistPlexSyncButton />, { wrapper });
}

function setupIdle(): void {
  plexGetActiveSyncJobsMock.mockResolvedValue(ok({ data: [] }));
  plexGetSyncJobStatusMock.mockResolvedValue(ok({ data: undefined }));
}

function setupRunning(): void {
  plexGetActiveSyncJobsMock.mockResolvedValue(
    ok({
      data: [
        {
          id: 'job-1',
          jobType: 'plexSyncWatchlist',
          status: 'running',
          startedAt: '2026-04-26T00:00:00Z',
          completedAt: null,
          durationMs: null,
          progress: { processed: 1, total: 10 },
          result: null,
          error: null,
        },
      ],
    })
  );
  plexGetSyncJobStatusMock.mockResolvedValue(ok({ data: undefined }));
}

describe('WatchlistPlexSyncButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plexStartSyncJobMock.mockResolvedValue(ok({ data: { jobId: 'job-1' } }));
  });

  it('renders the sync button with label "Sync with Plex" when idle', async () => {
    setupIdle();
    renderButton();
    const button = screen.getByTestId('watchlist-plex-sync-button');
    expect(button).toBeInTheDocument();
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveTextContent('Sync with Plex');
  });

  it('exposes an aria-label for assistive tech', async () => {
    setupIdle();
    renderButton();
    expect(screen.getByRole('button', { name: 'Sync watchlist with Plex' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('watchlist-plex-sync-button')).not.toBeDisabled()
    );
  });

  it('triggers a plexSyncWatchlist mutation when clicked', async () => {
    setupIdle();
    renderButton();
    const button = screen.getByTestId('watchlist-plex-sync-button');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(plexStartSyncJobMock).toHaveBeenCalledTimes(1));
    expect(plexStartSyncJobMock).toHaveBeenCalledWith({ body: { jobType: 'plexSyncWatchlist' } });
  });

  it('disables the button and swaps copy to "Syncing…" while a job is running', async () => {
    setupRunning();
    renderButton();
    const button = screen.getByTestId('watchlist-plex-sync-button');
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveTextContent('Syncing…');
  });

  it('surfaces the start mutation error path via the hook (error toast)', async () => {
    setupIdle();
    plexStartSyncJobMock.mockResolvedValue({
      data: undefined,
      error: { message: 'queue down' },
      response: { status: 503 } as Response,
    });
    renderButton();
    const button = screen.getByTestId('watchlist-plex-sync-button');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start Watchlist sync')
      )
    );
  });
});
