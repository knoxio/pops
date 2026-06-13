import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { useTestActionHandler } from './useTestActionHandler';

describe('useTestActionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes the procedure string to pillar().callDynamic with router/proc parts', async () => {
    mocks.callDynamic.mockResolvedValue({ kind: 'ok', value: { data: { connected: true } } });

    const { result } = renderHook(() => useTestActionHandler());

    await act(async () => {
      await result.current('media.plex.testConnection');
    });

    expect(mocks.callDynamic).toHaveBeenCalledOnce();
    expect(mocks.callDynamic).toHaveBeenCalledWith('media', 'plex', 'testConnection', {}, 'query');
  });

  it('resolves when the procedure reports connected: true', async () => {
    mocks.callDynamic.mockResolvedValue({ kind: 'ok', value: { data: { connected: true } } });

    const { result } = renderHook(() => useTestActionHandler());

    await expect(result.current('media.plex.testConnection')).resolves.toBeUndefined();
  });

  it('throws the procedure-supplied error when connected: false', async () => {
    mocks.callDynamic.mockResolvedValue({
      kind: 'ok',
      value: { data: { connected: false, error: 'token rejected' } },
    });

    const { result } = renderHook(() => useTestActionHandler());

    await expect(result.current('media.plex.testConnection')).rejects.toThrow('token rejected');
  });

  it('throws a generic message when connected: false has no error string', async () => {
    mocks.callDynamic.mockResolvedValue({
      kind: 'ok',
      value: { data: { connected: false } },
    });

    const { result } = renderHook(() => useTestActionHandler());

    await expect(result.current('media.plex.testConnection')).rejects.toThrow('Connection failed');
  });

  it('treats non-envelope return values as success (no .data field)', async () => {
    mocks.callDynamic.mockResolvedValue({ kind: 'ok', value: { ok: true } });

    const { result } = renderHook(() => useTestActionHandler());

    await expect(result.current('media.plex.testConnection')).resolves.toBeUndefined();
  });

  it('throws when the pillar is unavailable', async () => {
    mocks.callDynamic.mockResolvedValue({ kind: 'unavailable', pillar: 'media' });

    const { result } = renderHook(() => useTestActionHandler());

    await expect(result.current('media.plex.testConnection')).rejects.toThrow(
      "Pillar 'media' is unavailable"
    );
  });

  it('throws when the pillar is degraded', async () => {
    mocks.callDynamic.mockResolvedValue({
      kind: 'degraded',
      pillar: 'media',
      reason: 'reconciling',
    });

    const { result } = renderHook(() => useTestActionHandler());

    await expect(result.current('media.plex.testConnection')).rejects.toThrow(
      "Pillar 'media' is degraded (reconciling)"
    );
  });

  it('throws when the runtime procedure path does not exist on the pillar', async () => {
    mocks.callDynamic.mockResolvedValue({
      kind: 'contract-mismatch',
      pillar: 'media',
      actual: 'plex.testConnection',
    });

    const { result } = renderHook(() => useTestActionHandler());

    await expect(result.current('media.plex.testConnection')).rejects.toThrow(
      'Cannot call procedure: media.plex.testConnection'
    );
  });

  it('rejects malformed procedure strings without calling the SDK', async () => {
    const { result } = renderHook(() => useTestActionHandler());

    await expect(result.current('plex.testConnection')).rejects.toThrow(
      'Cannot call procedure: plex.testConnection'
    );
    await expect(result.current('a.b.c.d')).rejects.toThrow('Cannot call procedure: a.b.c.d');
    expect(mocks.callDynamic).not.toHaveBeenCalled();
  });
});
