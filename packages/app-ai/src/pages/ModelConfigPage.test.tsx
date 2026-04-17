import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SETTINGS_KEYS } from '@pops/types';

import { ModelConfigPage } from './ModelConfigPage';

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
const mockMutateAsync = vi.fn();
const mockSettingsGet = vi.fn();
const mockStatsQuery = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    core: {
      settings: {
        get: {
          useQuery: (...args: unknown[]) => mockSettingsGet(...args),
        },
        set: {
          useMutation: () => ({ mutateAsync: mockMutateAsync }),
        },
      },
      aiUsage: {
        getStats: {
          useQuery: () => mockStatsQuery(),
        },
      },
    },
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ModelConfigPage />
    </MemoryRouter>
  );
}

function setupDefaults(overrides?: {
  settings?: Record<string, string>;
  stats?: Record<string, unknown>;
  loading?: boolean;
}) {
  const settings = overrides?.settings ?? {};
  const loading = overrides?.loading ?? false;

  mockSettingsGet.mockImplementation((input: { key: string }) => ({
    data: settings[input.key] ? { data: { key: input.key, value: settings[input.key] } } : null,
    isLoading: loading,
    error: null,
  }));

  mockStatsQuery.mockReturnValue({
    data: overrides?.stats ?? {
      last30Days: { inputTokens: 50000, outputTokens: 10000, cost: 0.5, apiCalls: 100 },
      totalApiCalls: 200,
      totalCacheHits: 50,
      totalCost: 1.0,
      totalInputTokens: 100000,
      totalOutputTokens: 20000,
      cacheHitRate: 0.2,
      avgCostPerCall: 0.005,
    },
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMutateAsync.mockResolvedValue({ data: { key: 'test', value: 'test' } });
});

describe('ModelConfigPage', () => {
  it('renders the page heading and form fields', () => {
    setupDefaults();
    renderPage();
    expect(screen.getByText('Model Configuration')).toBeInTheDocument();
    expect(screen.getByText('AI Model')).toBeInTheDocument();
    expect(screen.getByText('Monthly Token Budget')).toBeInTheDocument();
    expect(screen.getByText('When Budget Exceeded')).toBeInTheDocument();
    expect(screen.getByText('Save Configuration')).toBeInTheDocument();
  });

  it('shows loading skeleton while settings load', () => {
    setupDefaults({ loading: true });
    renderPage();
    expect(screen.getByText('Model Configuration')).toBeInTheDocument();
    // Form fields should not be rendered during loading
    expect(screen.queryByText('AI Model')).not.toBeInTheDocument();
  });

  it('populates form with existing settings', () => {
    setupDefaults({
      settings: {
        [SETTINGS_KEYS.AI_MODEL]: 'claude-haiku-4-5-20251001',
        [SETTINGS_KEYS.AI_MONTHLY_TOKEN_BUDGET]: '500000',
        [SETTINGS_KEYS.AI_BUDGET_EXCEEDED_FALLBACK]: 'alert',
      },
    });
    renderPage();
    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toHaveValue('claude-haiku-4-5-20251001');
    expect(selects[1]).toHaveValue('alert');
    expect(screen.getByDisplayValue('500000')).toBeInTheDocument();
  });

  it('saves all settings on submit and shows toast', async () => {
    setupDefaults();
    renderPage();

    const user = userEvent.setup();
    await user.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(3);
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      key: SETTINGS_KEYS.AI_MODEL,
      value: 'claude-haiku-4-5-20251001',
    });
    expect(mockMutateAsync).toHaveBeenCalledWith({
      key: SETTINGS_KEYS.AI_MONTHLY_TOKEN_BUDGET,
      value: '',
    });
    expect(mockMutateAsync).toHaveBeenCalledWith({
      key: SETTINGS_KEYS.AI_BUDGET_EXCEEDED_FALLBACK,
      value: 'skip',
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('AI configuration saved');
  });

  it('shows error toast on save failure', async () => {
    setupDefaults();
    mockMutateAsync.mockRejectedValue(new Error('Network error'));
    renderPage();

    const user = userEvent.setup();
    await user.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to save: Network error');
    });
  });

  it('displays current usage stats', () => {
    setupDefaults({
      settings: { [SETTINGS_KEYS.AI_MONTHLY_TOKEN_BUDGET]: '200000' },
    });
    renderPage();
    expect(screen.getByText('Current Month Tokens')).toBeInTheDocument();
    expect(screen.getByText('60,000')).toBeInTheDocument(); // last30Days inputTokens 50000 + outputTokens 10000
    expect(screen.getByText('Monthly Budget')).toBeInTheDocument();
    expect(screen.getByText('200,000')).toBeInTheDocument();
  });

  it('shows budget exceeded alert when over limit', () => {
    setupDefaults({
      settings: {
        [SETTINGS_KEYS.AI_MONTHLY_TOKEN_BUDGET]: '1000',
        [SETTINGS_KEYS.AI_BUDGET_EXCEEDED_FALLBACK]: 'skip',
      },
      stats: {
        last30Days: {
          cost: 0.01,
          apiCalls: 5,
          cacheHits: 0,
          inputTokens: 900,
          outputTokens: 200,
        },
        totalApiCalls: 5,
        totalCacheHits: 0,
        totalCost: 0.01,
        totalInputTokens: 900,
        totalOutputTokens: 200,
        cacheHitRate: 0,
        avgCostPerCall: 0.002,
      },
    });
    renderPage();
    expect(screen.getByText('Budget exceeded')).toBeInTheDocument();
    expect(screen.getByText(/AI categorisation is currently disabled/)).toBeInTheDocument();
  });

  it('shows progress bar when budget is set', () => {
    setupDefaults({
      settings: { [SETTINGS_KEYS.AI_MONTHLY_TOKEN_BUDGET]: '200000' },
    });
    renderPage();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText(/60,000 \/ 200,000 tokens/)).toBeInTheDocument();
  });

  it('shows no progress bar when budget is not set', () => {
    setupDefaults();
    renderPage();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
