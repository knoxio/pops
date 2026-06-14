import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CacheManagementPage } from './CacheManagementPage';

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockClearStale = vi.fn();
const mockClearAll = vi.fn();
const mockInvalidate = vi.fn().mockResolvedValue(undefined);
const mockCacheStats = vi.fn();
const mockGetStats = vi.fn();

interface MutationHandlers {
  onSuccess: (d: unknown) => void;
  onError: () => void;
}

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'aiUsage.cacheStats') return mockCacheStats();
    if (key === 'aiUsage.getStats') return mockGetStats();
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (_pillarId: string, path: readonly string[], options: MutationHandlers) => {
    const key = path.join('.');
    const { onSuccess, onError } = options;
    if (key === 'aiUsage.clearStaleCache') {
      return {
        mutate: (input: unknown) => mockClearStale(input, { onSuccess, onError }),
        isPending: false,
      };
    }
    if (key === 'aiUsage.clearAllCache') {
      return {
        mutate: () => mockClearAll({ onSuccess, onError }),
        isPending: false,
      };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    invalidate: mockInvalidate,
    setData: vi.fn(),
    fetchQuery: vi.fn(),
  }),
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

  it('calls clearStaleCache with configured days and shows toast', async () => {
    setupDefaults();
    mockClearStale.mockImplementation(
      (_input: unknown, { onSuccess }: { onSuccess: (d: { removed: number }) => void }) => {
        onSuccess({ removed: 12 });
      }
    );
    renderPage();

    const user = userEvent.setup();
    const daysInput = screen.getByLabelText('Days threshold for stale entries');
    expect(daysInput).toHaveValue(30);

    await user.click(screen.getByRole('button', { name: 'Clear Stale' }));

    expect(mockClearStale).toHaveBeenCalledWith({ maxAgeDays: 30 }, expect.anything());
    expect(mockToastSuccess).toHaveBeenCalledWith('Removed 12 stale cache entries');
  });

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

    expect(screen.getByText('Clear entire AI cache?')).toBeInTheDocument();
    expect(screen.getByText(/150 cached/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear All' }));
    expect(mockClearAll).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith('Cleared 150 cache entries');
  });

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

  it('shows — for hit rate when there are no AI usage events', () => {
    setupDefaults({ totalApiCalls: 0, totalCacheHits: 0, cacheHitRate: 0 });
    renderPage();

    expect(screen.getByText('Hit Rate')).toBeInTheDocument();
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
