/**
 * Tests for the cross-pillar URI dispatcher (ADR-026 P2).
 *
 * The remote-pillar lookup is driven through `POPS_PILLARS` + the registry
 * cache reset: `getRemotePillarEntry` reads the same cache, so a test must
 * set the env and reset the cache for the entry to be visible.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchUri, type RemoteResolve } from '../dispatcher.js';
import { __resetPillarRegistryCache } from '../registry.js';

import type { ModuleManifest, UriResolverResult } from '@pops/types';

const ENV_KEY = 'POPS_PILLARS';
let original: string | undefined;

beforeEach(() => {
  original = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  __resetPillarRegistryCache();
});

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
  __resetPillarRegistryCache();
});

const ALL_INSTALLED = (): boolean => true;
const EMPTY_REGISTRY: readonly ModuleManifest[] = [];

describe('dispatchUri — malformed', () => {
  it('returns malformed without consulting the pillar registry', async () => {
    process.env[ENV_KEY] = 'food:http://food-api:3000';
    __resetPillarRegistryCache();
    const remote = vi.fn();
    const result = await dispatchUri('not-a-pops-uri', {
      registry: EMPTY_REGISTRY,
      isInstalled: ALL_INSTALLED,
      remoteResolve: remote,
    });
    expect(result.kind).toBe('malformed');
    expect(remote).not.toHaveBeenCalled();
  });
});

describe('dispatchUri — in-process fallback', () => {
  it('falls through to resolveUri when no pillar entry matches', async () => {
    const manifest: ModuleManifest = {
      id: 'finance',
      name: 'Finance',
      surfaces: ['app'],
      uriHandler: {
        types: ['transaction'],
        resolve: async (_type, id) => ({ kind: 'object', data: { id } }),
      },
    };
    const remote = vi.fn();
    const result = await dispatchUri('pops:finance/transaction/tx-1', {
      registry: [manifest],
      isInstalled: ALL_INSTALLED,
      remoteResolve: remote,
    });
    expect(remote).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: 'object',
      moduleId: 'finance',
      type: 'transaction',
      id: 'tx-1',
      data: { id: 'tx-1' },
    });
  });

  it('treats a throwing lookupPillar (e.g. DB error) as a cache miss and resolves in-process', async () => {
    const manifest: ModuleManifest = {
      id: 'finance',
      name: 'Finance',
      surfaces: ['app'],
      uriHandler: {
        types: ['transaction'],
        resolve: async (_type, id) => ({ kind: 'object', data: { id } }),
      },
    };
    const remote = vi.fn();
    const result = await dispatchUri('pops:finance/transaction/tx-1', {
      registry: [manifest],
      isInstalled: ALL_INSTALLED,
      remoteResolve: remote,
      lookupPillar: () => {
        throw new Error('registry DB unavailable');
      },
    });
    // Must NOT bubble the throw (no 500) and must NOT hit the remote leg —
    // it falls through to in-process resolution.
    expect(remote).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: 'object',
      moduleId: 'finance',
      type: 'transaction',
      id: 'tx-1',
      data: { id: 'tx-1' },
    });
  });
});

describe('dispatchUri — remote leg', () => {
  beforeEach(() => {
    process.env[ENV_KEY] = 'food:http://food-api:3000';
    __resetPillarRegistryCache();
  });

  it('proxies the URI to the registered pillar and returns its response', async () => {
    const remoteResult: UriResolverResult = {
      kind: 'object',
      moduleId: 'food',
      type: 'recipe',
      id: 'rec-1',
      data: { title: 'Test Recipe' },
    };
    const remote: RemoteResolve = vi.fn(async (entry, uri) => {
      expect(entry.baseUrl).toBe('http://food-api:3000');
      expect(uri).toBe('pops:food/recipe/rec-1');
      return remoteResult;
    });

    const result = await dispatchUri('pops:food/recipe/rec-1', {
      registry: EMPTY_REGISTRY,
      isInstalled: ALL_INSTALLED,
      remoteResolve: remote,
    });
    expect(remote).toHaveBeenCalledTimes(1);
    expect(result).toEqual(remoteResult);
  });

  it('returns pillar-unavailable when the remote leg throws', async () => {
    const remote: RemoteResolve = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await dispatchUri('pops:food/recipe/rec-1', {
      registry: EMPTY_REGISTRY,
      isInstalled: ALL_INSTALLED,
      remoteResolve: remote,
    });
    expect(result).toEqual({
      kind: 'pillar-unavailable',
      moduleId: 'food',
      reason: 'ECONNREFUSED',
    });
  });

  it('returns pillar-unavailable with timeout reason when the remote leg aborts', async () => {
    const remote: RemoteResolve = (_entry, _uri, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const result = await dispatchUri('pops:food/recipe/rec-1', {
      registry: EMPTY_REGISTRY,
      isInstalled: ALL_INSTALLED,
      remoteResolve: remote,
      remoteTimeoutMs: 10,
    });
    expect(result.kind).toBe('pillar-unavailable');
    if (result.kind === 'pillar-unavailable') {
      expect(result.moduleId).toBe('food');
      expect(result.reason).toMatch(/timed out after 10ms/);
    }
  });

  it('returns pillar-unavailable on non-2xx HTTP response (default fetch remote)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('boom', { status: 502, statusText: 'Bad Gateway' }));
    try {
      const result = await dispatchUri('pops:food/recipe/rec-1', {
        registry: EMPTY_REGISTRY,
        isInstalled: ALL_INSTALLED,
      });
      expect(result).toEqual({
        kind: 'pillar-unavailable',
        moduleId: 'food',
        reason: expect.stringContaining('HTTP 502'),
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('returns pillar-unavailable when the remote response uses an unknown kind (default fetch remote)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ kind: 'wat', moduleId: 'food' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    try {
      const result = await dispatchUri('pops:food/recipe/rec-1', {
        registry: EMPTY_REGISTRY,
        isInstalled: ALL_INSTALLED,
      });
      expect(result).toEqual({
        kind: 'pillar-unavailable',
        moduleId: 'food',
        reason: expect.stringContaining("unknown response kind 'wat'"),
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('dispatchUri — self-pillar short-circuit', () => {
  it('resolves selfPillarId-owned URIs in-process even when registry has a self-entry', async () => {
    // The registry pillar serves the `pops:core/…` URI namespace, which is
    // intentionally NOT renamed with the pillar id — so the default self URI
    // namespace stays `core`.
    process.env[ENV_KEY] = 'core:http://registry-api:3000';
    __resetPillarRegistryCache();
    const remote = vi.fn();
    const manifest: ModuleManifest = {
      id: 'core',
      name: 'Core',
      surfaces: ['app'],
      uriHandler: {
        types: ['setting'],
        resolve: async (_type, id) => ({ kind: 'object', data: { id } }),
      },
    };
    const result = await dispatchUri('pops:core/setting/foo', {
      registry: [manifest],
      isInstalled: ALL_INSTALLED,
      remoteResolve: remote,
    });
    expect(remote).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: 'object',
      moduleId: 'core',
      type: 'setting',
      id: 'foo',
      data: { id: 'foo' },
    });
  });

  it('honours a custom selfPillarId for pillar-local dispatchers', async () => {
    process.env[ENV_KEY] = 'food:http://food-api:3000';
    __resetPillarRegistryCache();
    const remote = vi.fn();
    const manifest: ModuleManifest = {
      id: 'food',
      name: 'Food',
      surfaces: ['app'],
      uriHandler: {
        types: ['recipe'],
        resolve: async (_type, id) => ({ kind: 'object', data: { id } }),
      },
    };
    const result = await dispatchUri('pops:food/recipe/r-1', {
      registry: [manifest],
      isInstalled: ALL_INSTALLED,
      remoteResolve: remote,
      selfPillarId: 'food',
    });
    expect(remote).not.toHaveBeenCalled();
    expect(result.kind).toBe('object');
  });
});
