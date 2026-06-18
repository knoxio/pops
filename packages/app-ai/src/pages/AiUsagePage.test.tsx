import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const aiObservabilityGetStatsMock = vi.hoisted(() => vi.fn());
const aiObservabilityGetHistoryMock = vi.hoisted(() => vi.fn());
const aiObservabilityGetQualityMetricsMock = vi.hoisted(() => vi.fn());
const aiObservabilityGetLatencyStatsMock = vi.hoisted(() => vi.fn());
const aiUsageCacheStatsMock = vi.hoisted(() => vi.fn());
const aiProvidersListMock = vi.hoisted(() => vi.fn());
const aiBudgetsGetBudgetStatusMock = vi.hoisted(() => vi.fn());
const aiUsageClearStaleCacheMock = vi.hoisted(() => vi.fn());
const aiUsageClearAllCacheMock = vi.hoisted(() => vi.fn());
const aiProvidersHealthCheckMock = vi.hoisted(() => vi.fn());

vi.mock('../core-api/index.js', () => ({
  aiObservabilityGetStats: (...args: unknown[]) => aiObservabilityGetStatsMock(...args),
  aiObservabilityGetHistory: (...args: unknown[]) => aiObservabilityGetHistoryMock(...args),
  aiObservabilityGetQualityMetrics: (...args: unknown[]) =>
    aiObservabilityGetQualityMetricsMock(...args),
  aiObservabilityGetLatencyStats: (...args: unknown[]) =>
    aiObservabilityGetLatencyStatsMock(...args),
  aiUsageCacheStats: (...args: unknown[]) => aiUsageCacheStatsMock(...args),
  aiProvidersList: (...args: unknown[]) => aiProvidersListMock(...args),
  aiBudgetsGetBudgetStatus: (...args: unknown[]) => aiBudgetsGetBudgetStatusMock(...args),
  aiUsageClearStaleCache: (...args: unknown[]) => aiUsageClearStaleCacheMock(...args),
  aiUsageClearAllCache: (...args: unknown[]) => aiUsageClearAllCacheMock(...args),
  aiProvidersHealthCheck: (...args: unknown[]) => aiProvidersHealthCheckMock(...args),
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

function ok(data: unknown) {
  return { data, error: undefined };
}

/** A promise that never resolves — used to keep a query in its loading state. */
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
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<AiUsagePage />, { wrapper });
}

function setupMocks(overrides?: {
  stats?: Partial<typeof defaultStats> | null;
  history?: typeof defaultHistory | null;
  cache?: typeof defaultCacheStats | null;
  statsLoading?: boolean;
  historyLoading?: boolean;
  cacheLoading?: boolean;
  statsError?: boolean;
}) {
  const o = overrides ?? {};

  if (o.statsLoading) {
    aiObservabilityGetStatsMock.mockReturnValue(pending());
  } else if (o.statsError) {
    aiObservabilityGetStatsMock.mockResolvedValue({
      data: undefined,
      error: { message: 'Network error' },
      response: { status: 500 },
    });
  } else {
    aiObservabilityGetStatsMock.mockResolvedValue(
      ok(o.stats === null ? undefined : { ...defaultStats, ...o.stats })
    );
  }

  aiObservabilityGetHistoryMock.mockReturnValue(
    o.historyLoading
      ? pending()
      : Promise.resolve(ok(o.history === null ? undefined : (o.history ?? defaultHistory)))
  );
  aiObservabilityGetQualityMetricsMock.mockResolvedValue(ok({ byModel: [] }));
  aiObservabilityGetLatencyStatsMock.mockResolvedValue(
    ok({ avg: 0, p50: 0, p75: 0, p95: 0, p99: 0, slowQueries: [] })
  );
  aiUsageCacheStatsMock.mockReturnValue(
    o.cacheLoading
      ? pending()
      : Promise.resolve(ok(o.cache === null ? undefined : (o.cache ?? defaultCacheStats)))
  );
  aiProvidersListMock.mockResolvedValue(ok([]));
  aiBudgetsGetBudgetStatusMock.mockResolvedValue(ok([]));
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  aiUsageClearStaleCacheMock.mockResolvedValue(ok({ removed: 0 }));
  aiUsageClearAllCacheMock.mockResolvedValue(ok({ removed: 0 }));
  aiProvidersHealthCheckMock.mockResolvedValue(ok({ status: 'active', latencyMs: 1 }));
  setupMocks();
});

describe('AiUsagePage', () => {
  it('renders loading skeleton when stats are loading', () => {
    setupMocks({ statsLoading: true });
    renderPage();
    expect(screen.getByText('AI Observability')).toBeInTheDocument();
    expect(screen.queryByText('Total Cost')).not.toBeInTheDocument();
  });

  it('renders error alert on stats error', async () => {
    setupMocks({ statsError: true });
    renderPage();
    expect(await screen.findByText('Failed to load observability data')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('renders stat cards with correct values', async () => {
    renderPage();
    expect(await screen.findByText('Total Cost')).toBeInTheDocument();
    expect(screen.getByText('$0.1234')).toBeInTheDocument();
    expect(screen.getAllByText('Total Calls').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cache Hit Rate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
  });

  it('renders daily cost chart when history records exist', async () => {
    renderPage();
    expect(await screen.findByText('Daily Cost')).toBeInTheDocument();
  });

  it('does not render chart when history has no records', async () => {
    setupMocks({
      history: { records: [], summary: { totalCostUsd: 0, totalCalls: 0, totalCacheHits: 0 } },
    });
    renderPage();
    expect(await screen.findByText('Total Cost')).toBeInTheDocument();
    expect(screen.queryByText('Daily Cost')).not.toBeInTheDocument();
  });
});

describe('CacheManagement', () => {
  it('displays cache entry count and disk size', async () => {
    renderPage();
    expect(await screen.findByText('AI Cache')).toBeInTheDocument();
    expect(screen.getByText(/42 entries/)).toBeInTheDocument();
    expect(screen.getByText(/8\.0 KB/)).toBeInTheDocument();
  });

  it('renders Clear Stale and Clear All buttons', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /Clear Stale/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear All/i })).toBeInTheDocument();
  });

  it('calls clearStaleCache mutation with days value', async () => {
    renderPage();
    const clearStaleBtn = await screen.findByRole('button', { name: /Clear Stale/i });
    fireEvent.click(clearStaleBtn);
    await waitFor(() =>
      expect(aiUsageClearStaleCacheMock).toHaveBeenCalledWith({ body: { maxAgeDays: 30 } })
    );
  });

  it('shows confirmation dialog before clearing all cache', async () => {
    renderPage();
    const clearAllBtn = await screen.findByRole('button', { name: /Clear All/i });
    fireEvent.click(clearAllBtn);
    expect(await screen.findByText('Clear entire AI cache?')).toBeInTheDocument();
    expect(screen.getByText(/42 cached/)).toBeInTheDocument();
  });

  it('calls clearAllCache mutation when confirmed', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Clear All/i }));
    const dialogActions = screen.getAllByRole('button', { name: /Clear All/i });
    await user.click(dialogActions.at(-1)!);
    await waitFor(() => expect(aiUsageClearAllCacheMock).toHaveBeenCalled());
  });

  it('disables buttons when cache is empty', async () => {
    setupMocks({ cache: { totalEntries: 0, diskSizeBytes: 0 } });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Clear Stale/i })).toBeDisabled()
    );
    expect(screen.getByRole('button', { name: /Clear All/i })).toBeDisabled();
  });

  it('allows configuring stale days', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = (await screen.findByLabelText(/Older than/i)) as HTMLInputElement;
    await user.tripleClick(input);
    await user.keyboard('7');
    fireEvent.click(screen.getByRole('button', { name: /Clear Stale/i }));
    await waitFor(() =>
      expect(aiUsageClearStaleCacheMock).toHaveBeenCalledWith({ body: { maxAgeDays: 7 } })
    );
  });

  it('shows loading skeleton when cache stats are loading', () => {
    setupMocks({ cacheLoading: true });
    renderPage();
    expect(screen.getByText('AI Observability')).toBeInTheDocument();
  });
});
