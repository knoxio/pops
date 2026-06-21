import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const aiUsageCacheStatsMock = vi.hoisted(() => vi.fn());
const aiUsageGetStatsMock = vi.hoisted(() => vi.fn());
const aiUsageClearStaleCacheMock = vi.hoisted(() => vi.fn());
const aiUsageClearAllCacheMock = vi.hoisted(() => vi.fn());

vi.mock('../core-api/index.js', () => ({
  aiUsageCacheStats: (...args: unknown[]) => aiUsageCacheStatsMock(...args),
  aiUsageGetStats: (...args: unknown[]) => aiUsageGetStatsMock(...args),
  aiUsageClearStaleCache: (...args: unknown[]) => aiUsageClearStaleCacheMock(...args),
  aiUsageClearAllCache: (...args: unknown[]) => aiUsageClearAllCacheMock(...args),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { CacheManagementPage } from './CacheManagementPage';

function ok(data: unknown) {
  return { data, error: undefined };
}

function pending() {
  return new Promise(() => {});
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage(queryClient = makeQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, children)
    );
  return render(<CacheManagementPage />, { wrapper });
}

function setupDefaults(overrides?: {
  totalEntries?: number;
  diskSizeBytes?: number;
  cacheHitRate?: number;
  totalCacheHits?: number;
  totalApiCalls?: number;
  loading?: boolean;
}) {
  const loading = overrides?.loading ?? false;

  aiUsageCacheStatsMock.mockReturnValue(
    loading
      ? pending()
      : Promise.resolve(
          ok({
            totalEntries: overrides?.totalEntries ?? 150,
            diskSizeBytes: overrides?.diskSizeBytes ?? 24576,
          })
        )
  );

  aiUsageGetStatsMock.mockReturnValue(
    loading
      ? pending()
      : Promise.resolve(
          ok({
            totalApiCalls: overrides?.totalApiCalls ?? 200,
            totalCacheHits: overrides?.totalCacheHits ?? 50,
            cacheHitRate: overrides?.cacheHitRate ?? 0.2,
            totalCost: 1.0,
            avgCostPerCall: 0.005,
            totalInputTokens: 100000,
            totalOutputTokens: 20000,
          })
        )
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  aiUsageClearStaleCacheMock.mockResolvedValue(ok({ removed: 0 }));
  aiUsageClearAllCacheMock.mockResolvedValue(ok({ removed: 0 }));
});

describe('CacheManagementPage', () => {
  it('displays cache stats: total entries, disk size, and hit rate', async () => {
    setupDefaults({ totalEntries: 150, diskSizeBytes: 24576, cacheHitRate: 0.75 });
    renderPage();

    expect(await screen.findByText('Total Entries')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('Disk Size')).toBeInTheDocument();
    expect(screen.getByText('24.0 KB')).toBeInTheDocument();
    expect(screen.getByText('Hit Rate')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
  });

  it('calls clearStaleCache with configured days and shows toast', async () => {
    setupDefaults();
    aiUsageClearStaleCacheMock.mockResolvedValue(ok({ removed: 12 }));
    renderPage();

    const user = userEvent.setup();
    const daysInput = await screen.findByLabelText('Days threshold for stale entries');
    expect(daysInput).toHaveValue(30);

    await user.click(screen.getByRole('button', { name: 'Clear Stale' }));

    await waitFor(() =>
      expect(aiUsageClearStaleCacheMock).toHaveBeenCalledWith({ body: { maxAgeDays: 30 } })
    );
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith('Removed 12 stale cache entries')
    );
  });

  it('shows confirmation dialog before clearing all, then clears and toasts', async () => {
    setupDefaults({ totalEntries: 150 });
    aiUsageClearAllCacheMock.mockResolvedValue(ok({ removed: 150 }));
    renderPage();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Clear All/i }));

    expect(await screen.findByText('Clear entire AI cache?')).toBeInTheDocument();
    expect(screen.getByText(/150 cached/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear All' }));
    await waitFor(() => expect(aiUsageClearAllCacheMock).toHaveBeenCalled());
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Cleared 150 cache entries'));
  });

  it('invalidates the cache queries after clearing', async () => {
    setupDefaults();
    aiUsageClearStaleCacheMock.mockResolvedValue(ok({ removed: 5 }));
    const queryClient = makeQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderPage(queryClient);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Clear Stale' }));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['core', 'aiUsage'] })
    );
  });

  it('shows — for hit rate when there are no AI usage events', async () => {
    setupDefaults({ totalApiCalls: 0, totalCacheHits: 0, cacheHitRate: 0 });
    renderPage();

    expect(await screen.findByText('Hit Rate')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d+%/)).not.toBeInTheDocument();
  });

  it('shows loading skeletons while data loads', () => {
    setupDefaults({ loading: true });
    renderPage();

    expect(screen.queryByText('Total Entries')).not.toBeInTheDocument();
    expect(screen.queryByText('Disk Size')).not.toBeInTheDocument();
    expect(screen.queryByText('Hit Rate')).not.toBeInTheDocument();
  });
});
