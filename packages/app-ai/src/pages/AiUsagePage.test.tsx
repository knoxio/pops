import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetStats = vi.fn();
const mockGetHistory = vi.fn();
const mockGetQualityMetrics = vi.fn();
const mockGetLatencyStats = vi.fn();
const mockCacheStats = vi.fn();
const mockClearStaleMutate = vi.fn();
const mockClearAllMutate = vi.fn();
const mockInvalidate = vi.fn().mockResolvedValue(undefined);

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'aiObservability.getStats') return mockGetStats();
    if (key === 'aiObservability.getHistory') return mockGetHistory();
    if (key === 'aiObservability.getQualityMetrics') return mockGetQualityMetrics();
    if (key === 'aiObservability.getLatencyStats') return mockGetLatencyStats();
    if (key === 'aiUsage.cacheStats') return mockCacheStats();
    if (key === 'aiProviders.list') return { data: [], isLoading: false };
    if (key === 'aiBudgets.getBudgetStatus') return { data: [], isLoading: false };
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'aiUsage.clearStaleCache') {
      return { mutate: mockClearStaleMutate, isPending: false };
    }
    if (key === 'aiUsage.clearAllCache') {
      return { mutate: mockClearAllMutate, isPending: false };
    }
    if (key === 'aiProviders.healthCheck') {
      return { mutate: vi.fn(), isPending: false };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    invalidate: mockInvalidate,
    setData: vi.fn(),
    fetchQuery: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { AiUsagePage } from './AiUsagePage';

const defaultStats = {
  totalCalls: 100,
  totalInputTokens: 50000,
  totalOutputTokens: 10000,
  totalCostUsd: 0.1234,
  cacheHitRate: 0.75,
  errorRate: 0.01,
  byProvider: [],
  byModel: [],
  byDomain: [],
  byOperation: [],
};

const defaultHistory = {
  records: [
    {
      date: '2026-03-20',
      calls: 10,
      cacheHits: 30,
      inputTokens: 5000,
      outputTokens: 1000,
      costUsd: 0.01,
      errors: 0,
    },
  ],
  summary: { totalCostUsd: 0.01, totalCalls: 10, totalCacheHits: 30 },
};

const defaultCacheStats = {
  totalEntries: 42,
  diskSizeBytes: 8192,
};

function setupMocks(overrides?: {
  stats?: Partial<typeof defaultStats> | null;
  history?: typeof defaultHistory | null;
  cache?: typeof defaultCacheStats | null;
  statsLoading?: boolean;
  historyLoading?: boolean;
  cacheLoading?: boolean;
  statsError?: Error | null;
  historyError?: Error | null;
}) {
  const o = overrides ?? {};
  mockGetStats.mockReturnValue({
    data: o.stats === null ? undefined : { ...defaultStats, ...o.stats },
    isLoading: o.statsLoading ?? false,
    error: o.statsError ?? null,
  });
  mockGetHistory.mockReturnValue({
    data: o.history === null ? undefined : (o.history ?? defaultHistory),
    isLoading: o.historyLoading ?? false,
    error: o.historyError ?? null,
  });
  mockGetQualityMetrics.mockReturnValue({ data: { byModel: [] }, isLoading: false });
  mockGetLatencyStats.mockReturnValue({ data: null, isLoading: false });
  mockCacheStats.mockReturnValue({
    data: o.cache === null ? undefined : (o.cache ?? defaultCacheStats),
    isLoading: o.cacheLoading ?? false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

describe('AiUsagePage', () => {
  it('renders loading skeleton when stats are loading', () => {
    setupMocks({ statsLoading: true });
    render(<AiUsagePage />);
    expect(screen.getByText('AI Observability')).toBeInTheDocument();
    expect(screen.queryByText('Total Cost')).not.toBeInTheDocument();
  });

  it('renders error alert on stats error', () => {
    setupMocks({ statsError: new Error('Network error') });
    render(<AiUsagePage />);
    expect(screen.getByText('Failed to load observability data')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('renders stat cards with correct values', () => {
    render(<AiUsagePage />);
    expect(screen.getByText('Total Cost')).toBeInTheDocument();
    expect(screen.getByText('$0.1234')).toBeInTheDocument();
    expect(screen.getAllByText('Total Calls').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cache Hit Rate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
  });

  it('renders daily cost chart when history records exist', () => {
    render(<AiUsagePage />);
    expect(screen.getByText('Daily Cost')).toBeInTheDocument();
  });

  it('does not render chart when history has no records', () => {
    setupMocks({
      history: { records: [], summary: { totalCostUsd: 0, totalCalls: 0, totalCacheHits: 0 } },
    });
    render(<AiUsagePage />);
    expect(screen.queryByText('Daily Cost')).not.toBeInTheDocument();
  });
});

describe('CacheManagement', () => {
  it('displays cache entry count and disk size', () => {
    render(<AiUsagePage />);
    expect(screen.getByText('AI Cache')).toBeInTheDocument();
    expect(screen.getByText(/42 entries/)).toBeInTheDocument();
    expect(screen.getByText(/8\.0 KB/)).toBeInTheDocument();
  });

  it('renders Clear Stale and Clear All buttons', () => {
    render(<AiUsagePage />);
    expect(screen.getByRole('button', { name: /Clear Stale/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear All/i })).toBeInTheDocument();
  });

  it('calls clearStaleCache mutation with days value', async () => {
    render(<AiUsagePage />);
    const clearStaleBtn = screen.getByRole('button', { name: /Clear Stale/i });
    fireEvent.click(clearStaleBtn);
    expect(mockClearStaleMutate).toHaveBeenCalledWith({ maxAgeDays: 30 });
  });

  it('shows confirmation dialog before clearing all cache', async () => {
    render(<AiUsagePage />);
    const clearAllBtn = screen.getByRole('button', { name: /Clear All/i });
    fireEvent.click(clearAllBtn);
    expect(screen.getByText('Clear entire AI cache?')).toBeInTheDocument();
    expect(screen.getByText(/42 cached/)).toBeInTheDocument();
  });

  it('calls clearAllCache mutation when confirmed', async () => {
    const user = userEvent.setup();
    render(<AiUsagePage />);
    await user.click(screen.getByRole('button', { name: /Clear All/i }));
    const dialogActions = screen.getAllByRole('button', { name: /Clear All/i });
    await user.click(dialogActions.at(-1)!);
    expect(mockClearAllMutate).toHaveBeenCalled();
  });

  it('disables buttons when cache is empty', () => {
    setupMocks({ cache: { totalEntries: 0, diskSizeBytes: 0 } });
    render(<AiUsagePage />);
    expect(screen.getByRole('button', { name: /Clear Stale/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Clear All/i })).toBeDisabled();
  });

  it('allows configuring stale days', async () => {
    const user = userEvent.setup();
    render(<AiUsagePage />);
    const input = screen.getByLabelText(/Older than/i) as HTMLInputElement;
    await user.tripleClick(input);
    await user.keyboard('7');
    fireEvent.click(screen.getByRole('button', { name: /Clear Stale/i }));
    expect(mockClearStaleMutate).toHaveBeenCalledWith({ maxAgeDays: 7 });
  });

  it('shows loading skeleton when cache stats are loading', () => {
    setupMocks({ cacheLoading: true });
    render(<AiUsagePage />);
    expect(screen.getByText('AI Observability')).toBeInTheDocument();
  });
});
