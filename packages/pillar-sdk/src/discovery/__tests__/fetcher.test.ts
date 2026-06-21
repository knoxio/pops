import { describe, expect, it, vi } from 'vitest';

import { fetchRegistrySnapshot } from '../fetcher.js';
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
      'http://core-api:3001/core.registry.list',
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
      'http://core-api:3001/core.registry.list',
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
});
