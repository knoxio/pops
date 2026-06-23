import { RegistryApiError } from '@/registry-api-helpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isEnabled: vi.fn(),
}));

vi.mock('@/registry-api', () => ({
  featuresIsEnabled: (...args: unknown[]) => mocks.isEnabled(...args),
}));

import { useFeatureEnabled } from './use-feature-enabled';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

/** Resolves the Hey API `{ data }` envelope the SDK functions return. */
function ok(enabled: boolean) {
  return Promise.resolve({ data: { enabled } });
}

describe('useFeatureEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries core.features.isEnabled with the supplied key', async () => {
    mocks.isEnabled.mockReturnValue(ok(true));
    const { result } = renderHook(() => useFeatureEnabled('plex-importer'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(true));
    expect(mocks.isEnabled).toHaveBeenCalledWith({ path: { key: 'plex-importer' } });
  });

  it('returns the fallback while the query has no data', () => {
    mocks.isEnabled.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useFeatureEnabled('plex', true), { wrapper: wrapper() });
    expect(result.current).toBe(true);
  });

  it('returns the SDK boolean once the query resolves', async () => {
    mocks.isEnabled.mockReturnValue(ok(true));
    const { result } = renderHook(() => useFeatureEnabled('plex'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('falls back when the core pillar is unavailable (5xx)', async () => {
    mocks.isEnabled.mockResolvedValue({ error: { message: 'boom' }, response: { status: 503 } });
    const { result } = renderHook(() => useFeatureEnabled('plex', false), { wrapper: wrapper() });
    await waitFor(() => expect(mocks.isEnabled).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('falls back when the feature key is unknown (404)', async () => {
    mocks.isEnabled.mockRejectedValue(new RegistryApiError('not found', 404));
    const { result } = renderHook(() => useFeatureEnabled('ghost', false), { wrapper: wrapper() });
    await waitFor(() => expect(mocks.isEnabled).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
