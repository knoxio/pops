import { describe, expect, it } from 'vitest';

import { HttpDiscoveryTransport } from '../discovery.js';
import { PillarSdkError } from '../errors.js';
import { discoveredPillar, fakeFetch, jsonResponse } from './fixtures.js';

describe('HttpDiscoveryTransport', () => {
  it('GETs the registry snapshot URL and parses the tRPC envelope', async () => {
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
    expect(calledUrl).toBe('http://core-api:3001/trpc/core.registry.list');
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
    expect(calledUrl).toBe('http://core-api:3001/trpc/core.registry.list');
  });

  it('throws PillarSdkError on a non-2xx HTTP response', async () => {
    const fetchImpl = fakeFetch(
      () => new Response('nope', { status: 500, statusText: 'Server Error' })
    );
    const transport = new HttpDiscoveryTransport({ fetchImpl });
    await expect(transport.fetchSnapshot()).rejects.toBeInstanceOf(PillarSdkError);
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
