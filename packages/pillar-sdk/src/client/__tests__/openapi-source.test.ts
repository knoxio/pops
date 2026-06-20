import { describe, expect, it } from 'vitest';

import { PillarSdkError } from '../errors.js';
import { __resetSharedOpenApiCache, getRouteMap, OpenApiSourceCache } from '../openapi-source.js';
import { discoveredPillar, fakeFetch, jsonResponse } from './fixtures.js';

const OPENAPI = {
  openapi: '3.0.2',
  paths: {
    '/entities/{id}': {
      get: { operationId: 'entities.get', parameters: [{ name: 'id', in: 'path' }] },
    },
    '/users': {
      get: { operationId: 'users.get', parameters: [{ name: 'uri', in: 'query' }] },
    },
  },
};

function countingFetch(responder: (url: string) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  urls: string[];
} {
  const urls: string[] = [];
  const fetchImpl = fakeFetch((url) => {
    urls.push(url);
    return responder(url);
  });
  return { fetchImpl, urls };
}

describe('OpenApiSourceCache.getRouteMap', () => {
  it('fetches and builds the route map on first call, hitting GET /openapi', async () => {
    const { fetchImpl, urls } = countingFetch(() => jsonResponse(OPENAPI));
    const cache = new OpenApiSourceCache({ fetchImpl });
    const discovered = discoveredPillar({ pillarId: 'core', baseUrl: 'http://core-api:3001' });

    const routeMap = await cache.getRouteMap('core', discovered);

    expect(urls).toEqual(['http://core-api:3001/openapi']);
    expect(routeMap.get('entities.get')).toEqual({
      method: 'GET',
      pathTemplate: '/entities/{id}',
      pathParams: ['id'],
      queryParams: [],
      hasBody: false,
    });
    expect(routeMap.get('users.get')?.queryParams).toEqual(['uri']);
    expect(cache.missCount).toBe(1);
    expect(cache.refreshCount).toBe(1);
  });

  it('serves the cached map on the second call without refetching', async () => {
    const { fetchImpl, urls } = countingFetch(() => jsonResponse(OPENAPI));
    const cache = new OpenApiSourceCache({ fetchImpl });
    const discovered = discoveredPillar({ pillarId: 'core', baseUrl: 'http://core-api:3001' });

    const first = await cache.getRouteMap('core', discovered);
    const second = await cache.getRouteMap('core', discovered);

    expect(urls).toHaveLength(1);
    expect(second).toBe(first);
    expect(cache.hitCount).toBe(1);
    expect(cache.missCount).toBe(1);
  });

  it('refetches after the TTL expires', async () => {
    let now = 1_000;
    const { fetchImpl, urls } = countingFetch(() => jsonResponse(OPENAPI));
    const cache = new OpenApiSourceCache({ fetchImpl, ttlMs: 100, now: () => now });
    const discovered = discoveredPillar({ pillarId: 'core', baseUrl: 'http://core-api:3001' });

    await cache.getRouteMap('core', discovered);
    now += 50;
    await cache.getRouteMap('core', discovered);
    expect(urls).toHaveLength(1);

    now += 100;
    await cache.getRouteMap('core', discovered);
    expect(urls).toHaveLength(2);
    expect(cache.refreshCount).toBe(2);
  });

  it('fetches distinct pillars independently and keys the cache per pillar', async () => {
    const { fetchImpl, urls } = countingFetch(() => jsonResponse(OPENAPI));
    const cache = new OpenApiSourceCache({ fetchImpl });

    await cache.getRouteMap('core', discoveredPillar({ baseUrl: 'http://core-api:3001' }));
    await cache.getRouteMap('finance', discoveredPillar({ baseUrl: 'http://finance-api:3004' }));

    expect(urls).toEqual(['http://core-api:3001/openapi', 'http://finance-api:3004/openapi']);
  });

  it('shares one in-flight fetch across concurrent callers for the same pillar', async () => {
    let resolveFetch: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });
    const urls: string[] = [];
    const fetchImpl = fakeFetch(async (url) => {
      urls.push(url);
      await gate;
      return jsonResponse(OPENAPI);
    });
    const cache = new OpenApiSourceCache({ fetchImpl });
    const discovered = discoveredPillar({ pillarId: 'core', baseUrl: 'http://core-api:3001' });

    const a = cache.getRouteMap('core', discovered);
    const b = cache.getRouteMap('core', discovered);
    resolveFetch?.();
    const [ra, rb] = await Promise.all([a, b]);

    expect(urls).toHaveLength(1);
    expect(rb).toBe(ra);
  });

  it('throws PillarSdkError when the fetch rejects', async () => {
    const fetchImpl = fakeFetch(() => {
      throw new Error('connection refused');
    });
    const cache = new OpenApiSourceCache({ fetchImpl });
    const discovered = discoveredPillar({ pillarId: 'core', baseUrl: 'http://core-api:3001' });

    await expect(cache.getRouteMap('core', discovered)).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('does not cache a failed fetch — the next call retries', async () => {
    let attempt = 0;
    const fetchImpl = fakeFetch(() => {
      attempt += 1;
      if (attempt === 1) throw new Error('transient');
      return jsonResponse(OPENAPI);
    });
    const cache = new OpenApiSourceCache({ fetchImpl });
    const discovered = discoveredPillar({ pillarId: 'core', baseUrl: 'http://core-api:3001' });

    await expect(cache.getRouteMap('core', discovered)).rejects.toBeInstanceOf(PillarSdkError);
    const routeMap = await cache.getRouteMap('core', discovered);
    expect(routeMap.get('entities.get')).toBeDefined();
    expect(attempt).toBe(2);
  });

  it('throws PillarSdkError on a non-2xx openapi response', async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ message: 'nope' }, { status: 503 }));
    const cache = new OpenApiSourceCache({ fetchImpl });
    const discovered = discoveredPillar({ pillarId: 'core', baseUrl: 'http://core-api:3001' });

    await expect(cache.getRouteMap('core', discovered)).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('throws PillarSdkError on a non-JSON openapi body', async () => {
    const fetchImpl = fakeFetch(() => new Response('not json', { status: 200 }));
    const cache = new OpenApiSourceCache({ fetchImpl });
    const discovered = discoveredPillar({ pillarId: 'core', baseUrl: 'http://core-api:3001' });

    await expect(cache.getRouteMap('core', discovered)).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('throws PillarSdkError when the body is not an OpenAPI document', async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(['not', 'a', 'doc']));
    const cache = new OpenApiSourceCache({ fetchImpl });
    const discovered = discoveredPillar({ pillarId: 'core', baseUrl: 'http://core-api:3001' });

    await expect(cache.getRouteMap('core', discovered)).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('invalidate(pillarId) drops only that pillar; invalidate() drops all', async () => {
    const { fetchImpl, urls } = countingFetch(() => jsonResponse(OPENAPI));
    const cache = new OpenApiSourceCache({ fetchImpl });
    const core = discoveredPillar({ baseUrl: 'http://core-api:3001' });
    const finance = discoveredPillar({ baseUrl: 'http://finance-api:3004' });

    await cache.getRouteMap('core', core);
    await cache.getRouteMap('finance', finance);
    expect(urls).toHaveLength(2);

    cache.invalidate('core');
    await cache.getRouteMap('core', core);
    await cache.getRouteMap('finance', finance);
    expect(urls).toHaveLength(3);

    cache.invalidate();
    await cache.getRouteMap('core', core);
    await cache.getRouteMap('finance', finance);
    expect(urls).toHaveLength(5);
  });
});

describe('getRouteMap (shared cache)', () => {
  it('caches across calls and resets with __resetSharedOpenApiCache', async () => {
    __resetSharedOpenApiCache();
    const { fetchImpl, urls } = countingFetch(() => jsonResponse(OPENAPI));
    const discovered = discoveredPillar({ pillarId: 'core', baseUrl: 'http://core-api:3001' });

    await getRouteMap('core', discovered, fetchImpl);
    await getRouteMap('core', discovered, fetchImpl);
    expect(urls).toHaveLength(1);

    __resetSharedOpenApiCache();
    await getRouteMap('core', discovered, fetchImpl);
    expect(urls).toHaveLength(2);
  });
});
