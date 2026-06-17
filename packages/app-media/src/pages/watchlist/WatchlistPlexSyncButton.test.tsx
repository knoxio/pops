import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStartMutate = vi.fn();
const mockGetActive = vi.fn();
const mockGetStatus = vi.fn();
let capturedStartOpts: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (
    _pillarId: string,
    path: readonly string[],
    input: unknown,
    opts?: Record<string, unknown>
  ) => {
    const key = path.join('.');
    if (key === 'plex.getActiveSyncJobs') return mockGetActive(input, opts);
    if (key === 'plex.getSyncJobStatus') return mockGetStatus(input, opts);
    return { data: undefined, isLoading: false };
  },
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: Record<string, (...args: unknown[]) => unknown>
  ) => {
    const key = path.join('.');
    if (key === 'plex.startSyncJob') {
      capturedStartOpts = opts;
      return { mutate: mockStartMutate, isPending: false };
    }
    return { mutate: vi.fn(), isPending: false };
  },
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

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<WatchlistPlexSyncButton />, { wrapper });
}

function setupIdle(): void {
  mockGetActive.mockReturnValue({ data: { data: [] }, isLoading: false });
  mockGetStatus.mockReturnValue({ data: undefined, isLoading: false });
}

function setupRunning(): void {
  mockGetActive.mockReturnValue({ data: { data: [] }, isLoading: false });
  mockGetStatus.mockReturnValue({
    data: {
      data: {
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
    },
    isLoading: false,
  });
}

describe('WatchlistPlexSyncButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedStartOpts = {};
  });

  it('renders the sync button with label "Sync with Plex" when idle', () => {
    setupIdle();
    renderButton();
    const button = screen.getByTestId('watchlist-plex-sync-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Sync with Plex');
    expect(button).not.toBeDisabled();
  });

  it('exposes an aria-label for assistive tech', () => {
    setupIdle();
    renderButton();
    expect(screen.getByRole('button', { name: 'Sync watchlist with Plex' })).toBeInTheDocument();
  });

  it('triggers a plexSyncWatchlist mutation when clicked', () => {
    setupIdle();
    renderButton();
    fireEvent.click(screen.getByTestId('watchlist-plex-sync-button'));
    expect(mockStartMutate).toHaveBeenCalledTimes(1);
    expect(mockStartMutate).toHaveBeenCalledWith({ jobType: 'plexSyncWatchlist' });
  });

  it('disables the button and swaps copy to "Syncing…" while a job is running', () => {
    setupRunning();
    renderButton();
    const button = screen.getByTestId('watchlist-plex-sync-button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Syncing…');
  });

  it('surfaces the start mutation error path via the hook (error toast)', () => {
    setupIdle();
    renderButton();
    const onError = capturedStartOpts.onError;
    expect(typeof onError).toBe('function');
    if (typeof onError !== 'function') return;
    onError({ message: 'queue down' });
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start Watchlist sync')
    );
  });
});
