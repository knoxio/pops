import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SettingsManifest } from '@pops/types';

const mocks = vi.hoisted(() => ({
  callDynamic: vi.fn(),
}));

vi.mock('@pops/pillar-sdk/client', () => ({
  pillar: (pillarId: string) => ({
    callDynamic: (routerName: string, procName: string, input: unknown, kind: string) =>
      mocks.callDynamic(pillarId, routerName, procName, input, kind),
  }),
}));

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarSdkOptions: () => ({}),
}));

import { useTrpcOptionsLoaders } from './useTrpcOptionsLoaders';

function getLoader(
  loaders: Record<string, () => Promise<{ value: string; label: string }[]>>,
  key: string
): () => Promise<{ value: string; label: string }[]> {
  const loader = loaders[key];
  if (!loader) throw new Error(`Expected loader '${key}' to be registered`);
  return loader;
}

function manifestWithLoader(
  procedure: string,
  valueKey = 'id',
  labelKey = 'name'
): SettingsManifest {
  return {
    id: 'test',
    title: 'Test',
    order: 0,
    groups: [
      {
        id: 'g1',
        title: 'G1',
        fields: [
          {
            key: 'library',
            label: 'Library',
            type: 'select',
            optionsLoader: { procedure, valueKey, labelKey },
          },
        ],
      },
    ],
  };
}

describe('useTrpcOptionsLoaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no loaders for fields without optionsLoader', () => {
    const { result } = renderHook(() =>
      useTrpcOptionsLoaders({
        id: 'test',
        title: 'Test',
        order: 0,
        groups: [
          {
            id: 'g1',
            title: 'G1',
            fields: [{ key: 'k', label: 'K', type: 'text' }],
          },
        ],
      })
    );
    expect(Object.keys(result.current)).toEqual([]);
  });

  it('builds one loader per optionsLoader field, keyed by field.key', () => {
    const { result } = renderHook(() => useTrpcOptionsLoaders(manifestWithLoader('media.arr.x')));
    expect(Object.keys(result.current)).toEqual(['library']);
  });

  it('invokes callDynamic with the procedure split into (pillar, router, proc)', async () => {
    mocks.callDynamic.mockResolvedValue({ kind: 'ok', value: { data: [] } });

    const { result } = renderHook(() =>
      useTrpcOptionsLoaders(manifestWithLoader('media.arr.getRootFolders'))
    );

    await getLoader(result.current, 'library')();

    expect(mocks.callDynamic).toHaveBeenCalledWith(
      'media',
      'arr',
      'getRootFolders',
      undefined,
      'query'
    );
  });

  it('maps the data envelope into {value, label} pairs via the configured keys', async () => {
    mocks.callDynamic.mockResolvedValue({
      kind: 'ok',
      value: {
        data: [
          { path: '/movies', label: 'Movies' },
          { path: '/tv', label: 'TV' },
        ],
      },
    });

    const { result } = renderHook(() =>
      useTrpcOptionsLoaders(manifestWithLoader('media.arr.getRootFolders', 'path', 'path'))
    );

    const options = await getLoader(result.current, 'library')();

    expect(options).toEqual([
      { value: '/movies', label: '/movies' },
      { value: '/tv', label: '/tv' },
    ]);
  });

  it('coerces non-string value/label fields to strings', async () => {
    mocks.callDynamic.mockResolvedValue({
      kind: 'ok',
      value: { data: [{ id: 7, name: 'HD' }] },
    });

    const { result } = renderHook(() =>
      useTrpcOptionsLoaders(manifestWithLoader('media.arr.getQualityProfiles'))
    );

    const options = await getLoader(result.current, 'library')();

    expect(options).toEqual([{ value: '7', label: 'HD' }]);
  });

  it('returns an empty list when the envelope has no data field', async () => {
    mocks.callDynamic.mockResolvedValue({ kind: 'ok', value: {} });

    const { result } = renderHook(() => useTrpcOptionsLoaders(manifestWithLoader('p.r.x')));

    await expect(getLoader(result.current, 'library')()).resolves.toEqual([]);
  });

  it('throws when the procedure path is malformed', async () => {
    const { result } = renderHook(() => useTrpcOptionsLoaders(manifestWithLoader('only.two')));

    await expect(getLoader(result.current, 'library')()).rejects.toThrow(
      'Cannot call procedure: only.two'
    );
    expect(mocks.callDynamic).not.toHaveBeenCalled();
  });

  it('throws when the pillar is unavailable', async () => {
    mocks.callDynamic.mockResolvedValue({ kind: 'unavailable', pillar: 'media' });

    const { result } = renderHook(() => useTrpcOptionsLoaders(manifestWithLoader('media.arr.x')));

    await expect(getLoader(result.current, 'library')()).rejects.toThrow(
      "Pillar 'media' is unavailable"
    );
  });

  it('throws when the pillar is degraded', async () => {
    mocks.callDynamic.mockResolvedValue({
      kind: 'degraded',
      pillar: 'media',
      reason: 'reconciling',
    });

    const { result } = renderHook(() => useTrpcOptionsLoaders(manifestWithLoader('media.arr.x')));

    await expect(getLoader(result.current, 'library')()).rejects.toThrow(
      "Pillar 'media' is degraded (reconciling)"
    );
  });

  it('throws when the runtime path does not exist on the pillar', async () => {
    mocks.callDynamic.mockResolvedValue({
      kind: 'contract-mismatch',
      pillar: 'media',
      actual: 'arr.x',
    });

    const { result } = renderHook(() => useTrpcOptionsLoaders(manifestWithLoader('media.arr.x')));

    await expect(getLoader(result.current, 'library')()).rejects.toThrow(
      'Cannot call procedure: media.arr.x'
    );
  });
});
