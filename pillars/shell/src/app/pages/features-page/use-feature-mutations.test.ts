import { RegistryApiError } from '@/registry-api-helpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureStatus } from '@pops/types';

const mocks = vi.hoisted(() => ({
  setEnabled: vi.fn(),
  setUserPreference: vi.fn(),
  clearUserPreference: vi.fn(),
}));

vi.mock('@/registry-api', () => ({
  featuresSetEnabled: (...args: unknown[]) => mocks.setEnabled(...args),
  featuresSetUserPreference: (...args: unknown[]) => mocks.setUserPreference(...args),
  featuresClearUserPreference: (...args: unknown[]) => mocks.clearUserPreference(...args),
}));

import { useFeatureMutations } from './use-feature-mutations';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function systemFeature(overrides: Partial<FeatureStatus> = {}): FeatureStatus {
  return {
    key: 'plex.import',
    label: 'Plex Import',
    manifestId: 'plex',
    scope: 'system',
    enabled: true,
    default: true,
    state: 'enabled',
    credentials: [],
    ...overrides,
  };
}

function userFeature(overrides: Partial<FeatureStatus> = {}): FeatureStatus {
  return systemFeature({ scope: 'user', ...overrides });
}

/** Resolves the Hey API `{ data }` envelope so `unwrap` returns a value. */
function ok(enabled: boolean) {
  return Promise.resolve({ data: { enabled } });
}

describe('useFeatureMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setEnabled.mockReturnValue(ok(true));
    mocks.setUserPreference.mockReturnValue(ok(true));
    mocks.clearUserPreference.mockReturnValue(Promise.resolve({ data: { cleared: true } }));
  });

  it('routes system-scoped toggles through setEnabled with the {path, body} contract', async () => {
    const { result } = renderHook(() => useFeatureMutations(systemFeature({ key: 'media.scan' })), {
      wrapper: wrapper(),
    });
    act(() => result.current.toggle(true));

    await waitFor(() => expect(mocks.setEnabled).toHaveBeenCalled());
    expect(mocks.setEnabled).toHaveBeenCalledWith({
      path: { key: 'media.scan' },
      body: { enabled: true },
    });
    expect(mocks.setUserPreference).not.toHaveBeenCalled();
  });

  it('routes user-scoped toggles through setUserPreference', async () => {
    const { result } = renderHook(() => useFeatureMutations(userFeature({ key: 'beta.flag' })), {
      wrapper: wrapper(),
    });
    act(() => result.current.toggle(false));

    await waitFor(() => expect(mocks.setUserPreference).toHaveBeenCalled());
    expect(mocks.setUserPreference).toHaveBeenCalledWith({
      path: { key: 'beta.flag' },
      body: { enabled: false },
    });
    expect(mocks.setEnabled).not.toHaveBeenCalled();
  });

  it('routes the reset action through clearUserPreference with an empty body', async () => {
    const { result } = renderHook(() => useFeatureMutations(userFeature({ key: 'beta.flag' })), {
      wrapper: wrapper(),
    });
    act(() => result.current.resetUserOverride());

    await waitFor(() => expect(mocks.clearUserPreference).toHaveBeenCalled());
    expect(mocks.clearUserPreference).toHaveBeenCalledWith({
      path: { key: 'beta.flag' },
      body: {},
    });
  });

  it('surfaces the setEnabled error message', async () => {
    mocks.setEnabled.mockRejectedValue(new RegistryApiError('system denied', 400));
    const { result } = renderHook(() => useFeatureMutations(systemFeature()), {
      wrapper: wrapper(),
    });
    act(() => result.current.toggle(true));

    await waitFor(() => expect(result.current.errorMessage).toBe('system denied'));
  });

  it('falls back to the setUserPreference error when setEnabled has none', async () => {
    mocks.setUserPreference.mockRejectedValue(new RegistryApiError('user denied', 400));
    const { result } = renderHook(() => useFeatureMutations(userFeature()), { wrapper: wrapper() });
    act(() => result.current.toggle(true));

    await waitFor(() => expect(result.current.errorMessage).toBe('user denied'));
  });

  it('marks pending while a mutation is in flight', async () => {
    mocks.setEnabled.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useFeatureMutations(systemFeature()), {
      wrapper: wrapper(),
    });
    act(() => result.current.toggle(true));

    await waitFor(() => expect(result.current.pending).toBe(true));
  });
});
