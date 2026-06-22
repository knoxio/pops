import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isOk } from '../errors.js';
import { __resetSharedPillarClient, pillar } from '../factory.js';
import { __resetSharedOpenApiCache } from '../openapi-source.js';
import {
  discoveredPillar,
  fakeFetch,
  FakeRegistryTransport,
  jsonResponse,
  restFetch,
} from './fixtures.js';

function resetClients(): void {
  __resetSharedPillarClient();
  __resetSharedOpenApiCache();
}

describe('pillar().callDynamic — runtime path dispatch (REST transport)', () => {
  beforeEach(resetClients);
  afterEach(resetClients);

  it('dispatches to the idiomatic REST URL for the resolved operationId', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = restFetch(() => jsonResponse([{ id: 'wish-1' }]));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.callDynamic('wishlist', 'list', { limit: 5 });
    expect(isOk(result)).toBe(true);
    if (result.kind === 'ok') {
      expect(result.value).toEqual([{ id: 'wish-1' }]);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://finance-api:3004/wishlist/list');
    expect(calls[0]?.body).toEqual({ limit: 5 });
  });

  it('passes input through verbatim — no zod / shape validation in the SDK layer', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = restFetch(() => jsonResponse({ ok: true }));
    const finance = pillar('finance', { transport, fetchImpl });
    const weirdInput = { nested: { deeply: [1, 2, 3] }, flag: false };
    await finance.callDynamic('wishlist', 'list', weirdInput);
    expect(calls[0]?.body).toEqual(weirdInput);
  });

  it('serialises an omitted input as null (matches typed proxy)', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = restFetch(() => jsonResponse(null));
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.callDynamic('wishlist', 'list');
    expect(calls[0]?.body).toBeNull();
  });

  it("kind='mutation' routes through the same transport as kind='query'", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = restFetch(() => jsonResponse({ id: 'created' }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.callDynamic('wishlist', 'create', { name: 'x' }, 'mutation');
    expect(result.kind).toBe('ok');
    expect(calls[0]?.url).toBe('http://finance-api:3004/wishlist/create');
    expect(calls[0]?.body).toEqual({ name: 'x' });
  });

  it("returns 'unavailable' when the pillar is offline", async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const { fetchImpl } = restFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.callDynamic('wishlist', 'list', {});
    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') expect(result.pillar).toBe('finance');
  });

  it("returns 'not-found' when the procedure path replies 404", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => jsonResponse({ message: 'gone' }, { status: 404 }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.callDynamic('wishlist', 'list', {});
    expect(result.kind).toBe('not-found');
    if (result.kind === 'not-found') {
      expect(result.pillar).toBe('finance');
    }
  });

  it("returns 'contract-mismatch' for an operationId absent from the route map", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = restFetch(() => jsonResponse(null));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.callDynamic('wishlist', 'doesNotExist', {});
    expect(result.kind).toBe('contract-mismatch');
    if (result.kind === 'contract-mismatch') {
      expect(result.expected).toBe('wishlist.doesNotExist');
    }
    expect(calls).toHaveLength(0);
  });

  it('shares the discovery cache with the typed proxy (single lookup for both)', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => jsonResponse(null));
    const finance = pillar('finance', { transport, fetchImpl, cacheTtlMs: 60_000 });
    await finance.wishlist.list({});
    await finance.callDynamic('wishlist', 'list', {});
    await finance.callDynamic('budgets', 'list', {});
    expect(transport.callCount).toBe(1);
  });

  it('shares one OpenAPI fetch across typed-proxy and callDynamic dispatch', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const openapiFetches: string[] = [];
    const fetchImpl = fakeFetch((url) => {
      if (url.endsWith('/openapi')) {
        openapiFetches.push(url);
        return jsonResponse({
          openapi: '3.0.2',
          paths: {
            '/wishlist/list': { post: { operationId: 'wishlist.list', requestBody: {} } },
            '/budgets/list': { post: { operationId: 'budgets.list', requestBody: {} } },
          },
        });
      }
      return jsonResponse(null);
    });
    const finance = pillar('finance', { transport, fetchImpl, cacheTtlMs: 60_000 });
    await finance.wishlist.list({});
    await finance.callDynamic('budgets', 'list', {});
    expect(openapiFetches).toHaveLength(1);
  });
});
