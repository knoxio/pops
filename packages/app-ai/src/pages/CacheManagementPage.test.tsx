import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CacheManagementPage } from './CacheManagementPage';

// Mock sonner toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock tRPC
const mockClearStale = vi.fn();
const mockClearAll = vi.fn();
const mockInvalidate = vi.fn();
const mockCacheStats = vi.fn();
const mockGetStats = vi.fn();

vi.mock('@pops/api-client', () => ({
  trpc: {
    useUtils: () => ({
      core: {
        aiUsage: {
          cacheStats: { invalidate: mockInvalidate },
        },
      },
    }),
    core: {
      aiUsage: {
        cacheStats: {
          useQuery: () => mockCacheStats(),
        },
        getStats: {
          useQuery: () => mockGetStats(),
        },
        clearStaleCache: {
          useMutation: ({
            onSuccess,
            onError,
          }: {
            onSuccess: (d: unknown) => void;
            onError: () => void;
          }) => ({
            mutate: (input: unknown) => mockClearStale(input, { onSuccess, onError }),
            isPending: false,
          }),
        },
        clearAllCache: {
          useMutation: ({
            onSuccess,
            onError,
          }: {
            onSuccess: (d: unknown) => void;
            onError: () => void;
          }) => ({
            mutate: () => mockClearAll({ onSuccess, onError }),
            isPending: false,
          }),
        },
      },
    },
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <CacheManagementPage />
    </MemoryRouter>
  );
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

  mockCacheStats.mockReturnValue({
    data: loading
      ? undefined
      : {
          totalEntries: overrides?.totalEntries ?? 150,
          diskSizeBytes: overrides?.diskSizeBytes ?? 24576,
        },
    isLoading: loading,
    error: null,
  });

  mockGetStats.mockReturnValue({
    data: loading
      ? undefined
      : {
          totalApiCalls: overrides?.totalApiCalls ?? 200,
          totalCacheHits: overrides?.totalCacheHits ?? 50,
          cacheHitRate: overrides?.cacheHitRate ?? 0.2,
          totalCost: 1.0,
          avgCostPerCall: 0.005,
          totalInputTokens: 100000,
          totalOutputTokens: 20000,
        },
    isLoading: loading,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CacheManagementPage', () => {
  // AC: Cache stats display — total entries, disk size, hit rate
  it('displays cache stats: total entries, disk size, and hit rate', () => {
    setupDefaults({ totalEntries: 150, diskSizeBytes: 24576, cacheHitRate: 0.75 });
    renderPage();

    expect(screen.getByText('Total Entries')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('Disk Size')).toBeInTheDocument();
    expect(screen.getByText('24.0 KB')).toBeInTheDocument();
    expect(screen.getByText('Hit Rate')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
  });

  // AC: "Clear stale" button — removes entries older than configurable N days
  it('calls clearStaleCache with configured days and shows toast', async () => {
    setupDefaults();
    mockClearStale.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (d: { removed: number }) => void }) => {
        onSuccess({ removed: 12 });
      }
    );
    renderPage();

    const user = userEvent.setup();
    // Days input defaults to 30; verify it's present and the button fires with that value
    const daysInput = screen.getByLabelText('Days threshold for stale entries');
    expect(daysInput).toHaveValue(30);

    await user.click(screen.getByRole('button', { name: 'Clear Stale' }));

    expect(mockClearStale).toHaveBeenCalledWith({ maxAgeDays: 30 }, expect.anything());
    expect(mockToastSuccess).toHaveBeenCalledWith('Removed 12 stale cache entries');
  });

  // AC: "Clear all" button with confirmation dialog
  it('shows confirmation dialog before clearing all, then clears and toasts', async () => {
    setupDefaults({ totalEntries: 150 });
    mockClearAll.mockImplementation(
      ({ onSuccess }: { onSuccess: (d: { removed: number }) => void }) => {
        onSuccess({ removed: 150 });
      }
    );
    renderPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Clear All/i }));

    // Dialog should appear with entry count
    expect(screen.getByText('Clear entire AI cache?')).toBeInTheDocument();
    expect(screen.getByText(/150 cached/)).toBeInTheDocument();

    // Confirm
    await user.click(screen.getByRole('button', { name: 'Clear All' }));
    expect(mockClearAll).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith('Cleared 150 cache entries');
  });

  // AC: Stats refresh after clearing
  it('invalidates cacheStats query after clearing', async () => {
    setupDefaults();
    mockClearStale.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (d: { removed: number }) => void }) => {
        onSuccess({ removed: 5 });
      }
    );
    renderPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Clear Stale' }));

    await waitFor(() => {
      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  // AC: Hit Rate shows — when there are no AI usage events
  it('shows — for hit rate when there are no AI usage events', () => {
    setupDefaults({ totalApiCalls: 0, totalCacheHits: 0, cacheHitRate: 0 });
    renderPage();

    expect(screen.getByText('Hit Rate')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d+%/)).not.toBeInTheDocument();
  });

  // AC: Toast confirmation showing how many entries were removed
  it('shows loading skeletons while data loads', () => {
    setupDefaults({ loading: true });
    renderPage();

    // Stat cards replaced by skeletons, no values visible
    expect(screen.queryByText('Total Entries')).not.toBeInTheDocument();
    expect(screen.queryByText('Disk Size')).not.toBeInTheDocument();
    expect(screen.queryByText('Hit Rate')).not.toBeInTheDocument();
  });
});
