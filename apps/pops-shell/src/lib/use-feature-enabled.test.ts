import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (pillarId: string, path: readonly string[], input: unknown) =>
    mocks.query({ pillarId, path: [...path], input }),
}));

import { useFeatureEnabled } from './use-feature-enabled';

function queryResult(extra: Record<string, unknown>) {
  return {
    data: undefined,
    isUnavailable: false,
    isContractMismatch: false,
    ...extra,
  };
}

describe('useFeatureEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries core.features.isEnabled with the supplied key', () => {
    mocks.query.mockReturnValue(queryResult({}));
    renderHook(() => useFeatureEnabled('plex-importer'));
    expect(mocks.query).toHaveBeenCalledWith({
      pillarId: 'core',
      path: ['features', 'isEnabled'],
      input: { key: 'plex-importer' },
    });
  });

  it('returns the fallback while the query has no data', () => {
    mocks.query.mockReturnValue(queryResult({}));
    const { result } = renderHook(() => useFeatureEnabled('plex', true));
    expect(result.current).toBe(true);
  });

  it('returns the SDK boolean once the query resolves', () => {
    mocks.query.mockReturnValue(queryResult({ data: { enabled: true } }));
    const { result } = renderHook(() => useFeatureEnabled('plex'));
    expect(result.current).toBe(true);
  });

  it('falls back when the SDK reports the core pillar unavailable', () => {
    mocks.query.mockReturnValue(queryResult({ isUnavailable: true, data: { enabled: true } }));
    const { result } = renderHook(() => useFeatureEnabled('plex', false));
    expect(result.current).toBe(false);
  });

  it('falls back when the SDK reports a contract mismatch', () => {
    mocks.query.mockReturnValue(queryResult({ isContractMismatch: true, data: { enabled: true } }));
    const { result } = renderHook(() => useFeatureEnabled('plex', false));
    expect(result.current).toBe(false);
  });
});
