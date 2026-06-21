import { describe, expect, it } from 'vitest';

import { HttpDiscoveryTransport } from '../discovery.js';
import { PillarSdkError } from '../errors.js';
import { discoveredPillar, fakeFetch, jsonResponse } from './fixtures.js';

describe('HttpDiscoveryTransport', () => {
  it('GETs the canonical /registry/pillars URL and parses the tRPC envelope', async () => {
    let calledUrl = '';
    const fetchImpl = fakeFetch((url) => {
      calledUrl = url;
      return jsonResponse({
        result: {
          data: {
            pillars: [discoveredPillar()],
            fetchedAt: '2026-06-12T00:00:00.000Z',
          },
        },
      });
    });

    const transport = new HttpDiscoveryTransport({
      registryUrl: 'http://core-api:3001',
      fetchImpl,
    });

    const snapshot = await transport.fetchSnapshot();
    expect(calledUrl).toBe('http://core-api:3001/registry/pillars');
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.pillarId).toBe('finance');
  });

  it('accepts a flat (non-tRPC-wrapped) snapshot body', async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse({ pillars: [discoveredPillar({ pillarId: 'media' })] })
    );
    const transport = new HttpDiscoveryTransport({ fetchImpl });
    const snapshot = await transport.fetchSnapshot();
    expect(snapshot[0]?.pillarId).toBe('media');
  });

  it('strips a trailing slash from the registry URL', async () => {
    let calledUrl = '';
    const fetchImpl = fakeFetch((url) => {
      calledUrl = url;
      return jsonResponse({ pillars: [] });
    });
    const transport = new HttpDiscoveryTransport({
      registryUrl: 'http://core-api:3001/',
      fetchImpl,
    });
    await transport.fetchSnapshot();
    expect(calledUrl).toBe('http://core-api:3001/registry/pillars');
  });

  it('throws PillarSdkError on a non-2xx HTTP response', async () => {
    const fetchImpl = fakeFetch(
      () => new Response('nope', { status: 500, statusText: 'Server Error' })
    );
    const transport = new HttpDiscoveryTransport({ fetchImpl });
    await expect(transport.fetchSnapshot()).rejects.toBeInstanceOf(PillarSdkError);
  });

  describe('slash-first path resolution with legacy fallback', () => {
    function routedFetch(routes: Record<string, () => Response>): {
      fetchImpl: typeof fetch;
      paths: string[];
    } {
      const paths: string[] = [];
      const fetchImpl = fakeFetch((url) => {
        const path = new URL(url).pathname;
        paths.push(path);
        const make = routes[path];
        if (!make) throw new Error(`unrouted path ${path}`);
        return make();
      });
      return { fetchImpl, paths };
    }

    it('falls back to /core.registry.list on a 404 and parses the body identically', async () => {
      const { fetchImpl, paths } = routedFetch({
        '/registry/pillars': () => new Response('', { status: 404 }),
        '/core.registry.list': () => jsonResponse({ pillars: [discoveredPillar()] }),
      });
      const transport = new HttpDiscoveryTransport({
        registryUrl: 'http://core-api:3001',
        fetchImpl,
      });

      const snapshot = await transport.fetchSnapshot();
      expect(snapshot[0]?.pillarId).toBe('finance');
      expect(paths).toEqual(['/registry/pillars', '/core.registry.list']);

      // Long-lived transport caches the winner → next poll is a single request.
      await transport.fetchSnapshot();
      expect(paths).toEqual(['/registry/pillars', '/core.registry.list', '/core.registry.list']);
    });

    it('surfaces a 5xx WITHOUT falling back to the legacy path', async () => {
      const { fetchImpl, paths } = routedFetch({
        '/registry/pillars': () => new Response('boom', { status: 503, statusText: 'Down' }),
        '/core.registry.list': () => jsonResponse({ pillars: [discoveredPillar()] }),
      });
      const transport = new HttpDiscoveryTransport({
        registryUrl: 'http://core-api:3001',
        fetchImpl,
      });

      await expect(transport.fetchSnapshot()).rejects.toBeInstanceOf(PillarSdkError);
      expect(paths).toEqual(['/registry/pillars']);
    });

    it('self-heals when a cached path later 404s (rollback then legacy-removal)', async () => {
      let live = new Set(['/registry/pillars', '/core.registry.list']);
      const paths: string[] = [];
      const fetchImpl = fakeFetch((url) => {
        const path = new URL(url).pathname;
        paths.push(path);
        if (!live.has(path)) return new Response('', { status: 404 });
        const id = path === '/registry/pillars' ? 'finance' : 'media';
        return jsonResponse({ pillars: [discoveredPillar({ pillarId: id })] });
      });
      const transport = new HttpDiscoveryTransport({
        registryUrl: 'http://core-api:3001',
        fetchImpl,
      });

      await transport.fetchSnapshot();
      expect(paths).toEqual(['/registry/pillars']);

      // Core rolled back: cached slash 404s → in-call fallback to legacy.
      live = new Set(['/core.registry.list']);
      const fallback = await transport.fetchSnapshot();
      expect(fallback[0]?.pillarId).toBe('media');
      expect(paths).toEqual(['/registry/pillars', '/registry/pillars', '/core.registry.list']);

      // Legacy cached; steady single request, no thrash back to slash.
      paths.length = 0;
      await transport.fetchSnapshot();
      expect(paths).toEqual(['/core.registry.list']);

      // Phase-3 roll-forward: legacy removed → cached legacy 404s → re-resolve to slash.
      live = new Set(['/registry/pillars']);
      paths.length = 0;
      await transport.fetchSnapshot();
      expect(paths).toEqual(['/core.registry.list', '/registry/pillars']);
    });
  });

  it('throws PillarSdkError on invalid JSON', async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const transport = new HttpDiscoveryTransport({ fetchImpl });
    await expect(transport.fetchSnapshot()).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('throws PillarSdkError when the response shape is wrong', async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ pillars: 'wat' }));
    const transport = new HttpDiscoveryTransport({ fetchImpl });
    await expect(transport.fetchSnapshot()).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('throws PillarSdkError when an entry has an unknown status', async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse({
        pillars: [{ ...discoveredPillar(), status: 'exploded' }],
      })
    );
    const transport = new HttpDiscoveryTransport({ fetchImpl });
    await expect(transport.fetchSnapshot()).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('translates fetch rejections into PillarSdkError', async () => {
    const fetchImpl = fakeFetch(() => {
      throw new Error('network down');
    });
    const transport = new HttpDiscoveryTransport({ fetchImpl });
    await expect(transport.fetchSnapshot()).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('threads the optional capabilities map through into the parsed entry', async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse({
        pillars: [discoveredPillar({ capabilities: { settings: true, redis: false } })],
      })
    );
    const transport = new HttpDiscoveryTransport({ fetchImpl });
    const snapshot = await transport.fetchSnapshot();
    expect(snapshot[0]?.capabilities).toEqual({ settings: true, redis: false });
  });

  it('leaves capabilities undefined when the entry omits it', async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ pillars: [discoveredPillar()] }));
    const transport = new HttpDiscoveryTransport({ fetchImpl });
    const snapshot = await transport.fetchSnapshot();
    expect(snapshot[0]?.capabilities).toBeUndefined();
  });

  it('throws PillarSdkError when a capability value is not a boolean', async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse({
        pillars: [{ ...discoveredPillar(), capabilities: { settings: 'yes' } }],
      })
    );
    const transport = new HttpDiscoveryTransport({ fetchImpl });
    await expect(transport.fetchSnapshot()).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('attaches custom auth headers', async () => {
    let seen: Record<string, string> = {};
    const fetchImpl = fakeFetch((_url, init) => {
      seen = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse({ pillars: [] });
    });
    const transport = new HttpDiscoveryTransport({
      fetchImpl,
      headers: { authorization: 'Bearer service-token' },
    });
    await transport.fetchSnapshot();
    expect(seen['authorization']).toBe('Bearer service-token');
  });
});
