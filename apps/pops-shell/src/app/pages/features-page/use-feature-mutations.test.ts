import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
}));

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarMutation: (pillarId: string, path: readonly string[]) =>
    mocks.mutation({ pillarId, path: [...path] }),
}));

import { useFeatureMutations } from './use-feature-mutations';

import type { FeatureStatus } from '@pops/types';

type MutationCall = { pillarId: string; path: string[] };

type MutationResult = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  error?: { message: string };
};

function mutationResult(overrides: Partial<MutationResult> = {}): MutationResult {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  };
}

function wireMutations(opts: {
  setEnabled: MutationResult;
  setUserPreference: MutationResult;
  clearUserPreference: MutationResult;
}): void {
  mocks.mutation.mockImplementation(({ path }: MutationCall) => {
    const key = path.join('.');
    if (key === 'features.setEnabled') return opts.setEnabled;
    if (key === 'features.setUserPreference') return opts.setUserPreference;
    if (key === 'features.clearUserPreference') return opts.clearUserPreference;
    throw new Error(`Unexpected mutation path: ${key}`);
  });
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

describe('useFeatureMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all three core.features mutations against the core pillar', () => {
    wireMutations({
      setEnabled: mutationResult(),
      setUserPreference: mutationResult(),
      clearUserPreference: mutationResult(),
    });

    renderHook(() => useFeatureMutations(systemFeature()));

    expect(mocks.mutation).toHaveBeenCalledWith({
      pillarId: 'core',
      path: ['features', 'setEnabled'],
    });
    expect(mocks.mutation).toHaveBeenCalledWith({
      pillarId: 'core',
      path: ['features', 'setUserPreference'],
    });
    expect(mocks.mutation).toHaveBeenCalledWith({
      pillarId: 'core',
      path: ['features', 'clearUserPreference'],
    });
  });

  it('routes system-scoped toggles through setEnabled', () => {
    const setEnabled = mutationResult();
    const setUserPreference = mutationResult();
    wireMutations({
      setEnabled,
      setUserPreference,
      clearUserPreference: mutationResult(),
    });

    const { result } = renderHook(() => useFeatureMutations(systemFeature({ key: 'media.scan' })));
    act(() => result.current.toggle(true));

    expect(setEnabled.mutate).toHaveBeenCalledWith({ key: 'media.scan', enabled: true });
    expect(setUserPreference.mutate).not.toHaveBeenCalled();
  });

  it('routes user-scoped toggles through setUserPreference', () => {
    const setEnabled = mutationResult();
    const setUserPreference = mutationResult();
    wireMutations({
      setEnabled,
      setUserPreference,
      clearUserPreference: mutationResult(),
    });

    const { result } = renderHook(() => useFeatureMutations(userFeature({ key: 'beta.flag' })));
    act(() => result.current.toggle(false));

    expect(setUserPreference.mutate).toHaveBeenCalledWith({ key: 'beta.flag', enabled: false });
    expect(setEnabled.mutate).not.toHaveBeenCalled();
  });

  it('routes the reset action through clearUserPreference', () => {
    const clearUserPreference = mutationResult();
    wireMutations({
      setEnabled: mutationResult(),
      setUserPreference: mutationResult(),
      clearUserPreference,
    });

    const { result } = renderHook(() => useFeatureMutations(userFeature({ key: 'beta.flag' })));
    act(() => result.current.resetUserOverride());

    expect(clearUserPreference.mutate).toHaveBeenCalledWith({ key: 'beta.flag' });
  });

  it('surfaces the first error message from setEnabled, falling back to setUserPreference', () => {
    wireMutations({
      setEnabled: mutationResult({ error: { message: 'system denied' } }),
      setUserPreference: mutationResult({ error: { message: 'user denied' } }),
      clearUserPreference: mutationResult(),
    });

    const { result } = renderHook(() => useFeatureMutations(systemFeature()));
    expect(result.current.errorMessage).toBe('system denied');
  });

  it('falls back to the setUserPreference error when setEnabled has none', () => {
    wireMutations({
      setEnabled: mutationResult(),
      setUserPreference: mutationResult({ error: { message: 'user denied' } }),
      clearUserPreference: mutationResult(),
    });

    const { result } = renderHook(() => useFeatureMutations(systemFeature()));
    expect(result.current.errorMessage).toBe('user denied');
  });

  it('marks pending when any of the three mutations is in flight', () => {
    wireMutations({
      setEnabled: mutationResult(),
      setUserPreference: mutationResult(),
      clearUserPreference: mutationResult({ isPending: true }),
    });

    const { result } = renderHook(() => useFeatureMutations(systemFeature()));
    expect(result.current.pending).toBe(true);
  });
});
