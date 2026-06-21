import { describe, expect, it, vi } from 'vitest';

import { createSnapshotResolverLeg, fetchRegistrySnapshot } from '../fetcher.js';
import { jsonResponse, pillar, wirePayload } from './fixtures.js';

describe('fetchRegistrySnapshot', () => {
  it('parses a healthy tRPC envelope into PillarSnapshots', async () => {
    const fin = pillar('finance', 'http://finance-api:3004');
    const media = pillar('media', 'http://media-api:3005');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(wirePayload(fin, media)));

    const result = await fetchRegistrySnapshot({
      registryUrl: 'http://core-api:3001',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://core-api:3001/registry/pillars',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.pillars).toHaveLength(2);
    expect(result.pillars[0]!.pillarId).toBe('finance');
    expect(result.pillars[0]!.lastSeenAt).toBeInstanceOf(Date);
    expect(result.pillars[1]!.pillarId).toBe('media');
  });

  it('threads the optional capabilities map through into the PillarSnapshot', async () => {
    const fin = pillar('finance', 'http://finance-api:3004');
    const raw = {
      pillars: [
        {
          pillarId: fin.pillarId,
          baseUrl: fin.baseUrl,
          manifest: fin.manifest,
          lastSeenAt: fin.lastSeenAt.toISOString(),
          status: 'healthy',
          capabilities: { settings: true },
        },
      ],
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(raw));

    const result = await fetchRegistrySnapshot({
      registryUrl: 'http://core-api:3001',
      fetchImpl,
    });

    expect(result.pillars[0]!.capabilities).toEqual({ settings: true });
  });

  it('leaves capabilities undefined when the wire entry omits it', async () => {
    const fin = pillar('finance', 'http://finance-api:3004');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(wirePayload(fin)));

    const result = await fetchRegistrySnapshot({
      registryUrl: 'http://core-api:3001',
      fetchImpl,
    });

    expect(result.pillars[0]!.capabilities).toBeUndefined();
  });

  it('also accepts an un-enveloped payload (raw shape)', async () => {
    const fin = pillar('finance', 'http://finance-api:3004');
    const raw = {
      pillars: [
        {
          pillarId: fin.pillarId,
          baseUrl: fin.baseUrl,
          manifest: fin.manifest,
          lastSeenAt: fin.lastSeenAt.toISOString(),
          status: 'healthy',
        },
      ],
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(raw));

    const result = await fetchRegistrySnapshot({
      registryUrl: 'http://core-api:3001',
      fetchImpl,
    });

    expect(result.pillars).toHaveLength(1);
  });

  it('strips a trailing slash from the registry URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(wirePayload()));
    await fetchRegistrySnapshot({
      registryUrl: 'http://core-api:3001/',
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://core-api:3001/registry/pillars',
      expect.anything()
    );
  });

  it('throws on non-2xx', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('boom', { status: 503, statusText: 'Service Unavailable' }));
    await expect(
      fetchRegistrySnapshot({ registryUrl: 'http://core-api:3001', fetchImpl })
    ).rejects.toThrow(/HTTP 503/);
  });

  it('throws on malformed JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(
      fetchRegistrySnapshot({ registryUrl: 'http://core-api:3001', fetchImpl })
    ).rejects.toThrow(/malformed JSON/);
  });

  it('throws on schema-invalid response (missing pillarId)', async () => {
    const bad = {
      result: {
        data: {
          pillars: [
            {
              baseUrl: 'http://x:1',
              manifest: pillar('finance', 'http://x:1').manifest,
              lastSeenAt: new Date().toISOString(),
            },
          ],
        },
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(bad));
    await expect(
      fetchRegistrySnapshot({ registryUrl: 'http://core-api:3001', fetchImpl })
    ).rejects.toBeTruthy();
  });

  it('aborts the request when the timeout fires', async () => {
    const fetchImpl = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const reason = init.signal?.reason;
            reject(reason instanceof Error ? reason : new Error('aborted'));
          });
        })
    );

    await expect(
      fetchRegistrySnapshot({
        registryUrl: 'http://core-api:3001',
        fetchImpl,
        timeoutMs: 5,
      })
    ).rejects.toThrow(/timeout/);
  });

  it('marks registered=false when status is "unknown" and the field is absent', async () => {
    const fin = pillar('finance', 'http://finance-api:3004');
    const raw = {
      pillars: [
        {
          pillarId: fin.pillarId,
          baseUrl: fin.baseUrl,
          manifest: fin.manifest,
          lastSeenAt: fin.lastSeenAt.toISOString(),
          status: 'unknown',
        },
      ],
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(raw));
    const result = await fetchRegistrySnapshot({
      registryUrl: 'http://core-api:3001',
      fetchImpl,
    });
    expect(result.pillars[0]!.registered).toBe(false);
  });

  describe('slash-first path resolution with legacy fallback', () => {
    function routedFetch(routes: Record<string, () => Response>): {
      fetchImpl: ReturnType<typeof vi.fn>;
      paths: string[];
    } {
      const paths: string[] = [];
      const fetchImpl = vi.fn((url: string) => {
        const path = new URL(url).pathname;
        paths.push(path);
        const make = routes[path];
        if (!make) throw new Error(`unrouted path ${path}`);
        return Promise.resolve(make());
      });
      return { fetchImpl, paths };
    }

    it('falls back to /core.registry.list on a 404 and parses the body identically', async () => {
      const fin = pillar('finance', 'http://finance-api:3004');
      const { fetchImpl, paths } = routedFetch({
        '/registry/pillars': () => new Response('', { status: 404 }),
        '/core.registry.list': () => jsonResponse(wirePayload(fin)),
      });

      const result = await fetchRegistrySnapshot({
        registryUrl: 'http://core-api:3001',
        fetchImpl,
      });
      expect(result.pillars[0]!.pillarId).toBe('finance');
      expect(paths).toEqual(['/registry/pillars', '/core.registry.list']);
    });

    it('surfaces a 5xx WITHOUT falling back to the legacy path', async () => {
      const fin = pillar('finance', 'http://finance-api:3004');
      const { fetchImpl, paths } = routedFetch({
        '/registry/pillars': () => new Response('boom', { status: 503, statusText: 'Down' }),
        '/core.registry.list': () => jsonResponse(wirePayload(fin)),
      });

      await expect(
        fetchRegistrySnapshot({ registryUrl: 'http://core-api:3001', fetchImpl })
      ).rejects.toThrow(/HTTP 503/);
      expect(paths).toEqual(['/registry/pillars']);
    });

    it('caches the winning path across calls when a resolver is shared, self-healing on 404', async () => {
      const fin = pillar('finance', 'http://finance-api:3004');
      let live = new Set(['/registry/pillars', '/core.registry.list']);
      const paths: string[] = [];
      const fetchImpl = vi.fn((url: string) => {
        const path = new URL(url).pathname;
        paths.push(path);
        return Promise.resolve(
          live.has(path) ? jsonResponse(wirePayload(fin)) : new Response('', { status: 404 })
        );
      });
      const leg = createSnapshotResolverLeg();

      await fetchRegistrySnapshot({ registryUrl: 'http://core-api:3001', fetchImpl, leg });
      // Second poll reuses the cached slash winner — single request.
      await fetchRegistrySnapshot({ registryUrl: 'http://core-api:3001', fetchImpl, leg });
      expect(paths).toEqual(['/registry/pillars', '/registry/pillars']);

      // Core rolled back: cached slash 404s → in-call fallback to legacy + invalidate.
      live = new Set(['/core.registry.list']);
      await fetchRegistrySnapshot({ registryUrl: 'http://core-api:3001', fetchImpl, leg });
      expect(paths).toEqual([
        '/registry/pillars',
        '/registry/pillars',
        '/registry/pillars',
        '/core.registry.list',
      ]);

      // Legacy cached; steady single request, no thrash back to slash.
      paths.length = 0;
      await fetchRegistrySnapshot({ registryUrl: 'http://core-api:3001', fetchImpl, leg });
      expect(paths).toEqual(['/core.registry.list']);

      // Phase-3 roll-forward: legacy removed → cached legacy 404s → re-resolve to slash.
      live = new Set(['/registry/pillars']);
      paths.length = 0;
      await fetchRegistrySnapshot({ registryUrl: 'http://core-api:3001', fetchImpl, leg });
      expect(paths).toEqual(['/core.registry.list', '/registry/pillars']);
    });
  });
});
