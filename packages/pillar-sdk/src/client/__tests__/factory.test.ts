import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PillarCallError, isOk } from '../errors.js';
import { __resetSharedPillarClient, pillar } from '../factory.js';
import { __resetSharedOpenApiCache } from '../openapi-source.js';
import {
  discoveredPillar,
  fakeFetch,
  FakeRegistryTransport,
  FINANCE_OPENAPI,
  jsonResponse,
  restFetch,
} from './fixtures.js';

import type { DiscoveredPillar } from '../discovery.js';

type WishlistRouter = {
  wishlist: {
    list: (input: { limit: number }) => Promise<readonly { id: string }[]>;
  };
};

function resetClients(): void {
  __resetSharedPillarClient();
  __resetSharedOpenApiCache();
}

describe('pillar() factory — happy path (REST transport)', () => {
  let transport: FakeRegistryTransport;

  beforeEach(() => {
    resetClients();
    transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
  });

  afterEach(() => {
    resetClients();
  });

  it('resolves the OpenAPI route map and dispatches to the idiomatic REST URL', async () => {
    const { fetchImpl, calls } = restFetch(() => jsonResponse([{ id: 'wish-1' }]));
    const finance = pillar<WishlistRouter>('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({ limit: 10 });
    expect(isOk(result)).toBe(true);
    if (result.kind === 'ok') {
      expect(result.value).toEqual([{ id: 'wish-1' }]);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://finance-api:3004/wishlist/list');
    expect(calls[0]?.body).toEqual({ limit: 10 });
  });

  it('decodes the REST success body directly — no tRPC envelope unwrap', async () => {
    const { fetchImpl } = restFetch(() => jsonResponse({ result: { data: 'verbatim' } }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value).toEqual({ result: { data: 'verbatim' } });
    }
  });

  it('serialises a missing input argument as a null body', async () => {
    const { fetchImpl, calls } = restFetch(() => jsonResponse({ count: 0 }));
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.wishlist.list();
    expect(calls[0]?.body).toBeNull();
  });

  it('orThrow() unwraps the value on success', async () => {
    const { fetchImpl } = restFetch(() => jsonResponse([{ id: 'a' }, { id: 'b' }]));
    const finance = pillar<WishlistRouter>('finance', { transport, fetchImpl });
    const value = await finance.wishlist.list.orThrow({ limit: 5 });
    expect(value).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('supports auth header injection per-call', async () => {
    let seen: Record<string, string> = {};
    const fetchImpl = fakeFetch((url, init) => {
      if (url.endsWith('/openapi')) return jsonResponse(FINANCE_OPENAPI);
      seen = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse(null);
    });
    const finance = pillar('finance', {
      transport,
      fetchImpl,
      authHeaders: () => ({ authorization: 'Bearer svc-key' }),
    });
    await finance.wishlist.list({});
    expect(seen['authorization']).toBe('Bearer svc-key');
  });
});

describe('pillar() factory — failure modes (REST transport)', () => {
  beforeEach(resetClients);
  afterEach(resetClients);

  it("returns 'unavailable' when the pillar is not in the registry", async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const { fetchImpl } = restFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') expect(result.pillar).toBe('finance');
  });

  it("returns 'unavailable' when the pillar status is 'unavailable'", async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar({ status: 'unavailable' })],
    });
    const { fetchImpl } = restFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
  });

  it("returns 'degraded' (reconciling) when the pillar status is 'unknown'", async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar({ status: 'unknown' })],
    });
    const { fetchImpl } = restFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('degraded');
    if (result.kind === 'degraded') expect(result.reason).toBe('reconciling');
  });

  it("returns 'unavailable' when the registry itself is unreachable", async () => {
    const transport = new FakeRegistryTransport({
      failNext: 99,
      failError: new (await import('../errors.js')).PillarSdkError('registry down'),
    });
    const { fetchImpl } = restFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
  });

  it("returns 'unavailable' when the pillar's OpenAPI document cannot be fetched", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const fetchImpl = fakeFetch((url) => {
      if (url.endsWith('/openapi')) return new Response('boom', { status: 503 });
      return jsonResponse(null);
    });
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') expect(result.pillar).toBe('finance');
  });

  it("returns 'not-found' when the pillar replies 404 with a REST envelope", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() =>
      jsonResponse({ message: 'no such wish' }, { status: 404 })
    );
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('not-found');
    if (result.kind === 'not-found') {
      expect(result.pillar).toBe('finance');
      expect(result.message).toBe('no such wish');
    }
  });

  it("returns 'conflict' when the pillar replies 409", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => jsonResponse({ message: 'exists' }, { status: 409 }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') expect(result.message).toBe('exists');
  });

  it("returns 'bad-request' when the pillar replies 400", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => jsonResponse({ message: 'bad input' }, { status: 400 }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('bad-request');
    if (result.kind === 'bad-request') expect(result.message).toBe('bad input');
  });

  it("returns 'unauthorized' when the pillar replies 401", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => jsonResponse({ message: 'denied' }, { status: 401 }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unauthorized');
    if (result.kind === 'unauthorized') expect(result.message).toBe('denied');
  });

  it("returns 'contract-mismatch' when the operationId is absent from the route map", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = restFetch(() => jsonResponse(null));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.unknownRouter.list({});
    expect(result.kind).toBe('contract-mismatch');
    if (result.kind === 'contract-mismatch') {
      expect(result.pillar).toBe('finance');
      expect(result.expected).toBe('unknownRouter.list');
    }
    expect(calls).toHaveLength(0);
  });

  it("returns 'unavailable' when the pillar HTTP call rejects", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const fetchImpl = fakeFetch((url) => {
      if (url.endsWith('/openapi')) return jsonResponse(FINANCE_OPENAPI);
      throw new Error('connection refused');
    });
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
  });

  it("returns 'unavailable' on 5xx and on non-JSON success bodies", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => new Response('boom', { status: 502 }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
  });

  it('returns unavailable on a non-JSON 2xx body', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => new Response('not json', { status: 200 }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
  });

  it('detects a contract major-version skew before reading the route map or calling the pillar', async () => {
    const pillarRecord: DiscoveredPillar = discoveredPillar({
      manifest: {
        ...discoveredPillar().manifest,
        contract: {
          package: '@pops/finance-contract',
          version: '2.0.0',
          tag: 'contract-finance@v2.0.0',
        },
      },
    });
    const transport = new FakeRegistryTransport({ pillars: [pillarRecord] });
    let httpCalls = 0;
    const fetchImpl = fakeFetch(() => {
      httpCalls += 1;
      return jsonResponse(null);
    });
    const finance = pillar('finance', {
      transport,
      fetchImpl,
      contractVersion: '1.4.2',
    });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('contract-mismatch');
    expect(httpCalls).toBe(0);
    if (result.kind === 'contract-mismatch') {
      expect(result.expected).toBe('1.4.2');
      expect(result.actual).toBe('2.0.0');
    }
  });

  it('does not flag a same-major / different-minor skew as a mismatch', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => jsonResponse({ ok: true }));
    const finance = pillar('finance', {
      transport,
      fetchImpl,
      contractVersion: '1.0.0',
    });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('ok');
  });
});

describe('pillar() factory — orThrow()', () => {
  beforeEach(resetClients);
  afterEach(resetClients);

  it('throws a PillarCallError carrying the failure result', async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const { fetchImpl } = restFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    let captured: unknown;
    try {
      await finance.wishlist.list.orThrow({});
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(PillarCallError);
    if (captured instanceof PillarCallError) {
      expect(captured.pillarId).toBe('finance');
      expect(captured.result.kind).toBe('unavailable');
    }
  });
});

describe('pillar() factory — discovery cache behaviour', () => {
  beforeEach(resetClients);
  afterEach(resetClients);

  it('memoises discovery across repeated calls within the TTL', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => jsonResponse(null));
    const finance = pillar('finance', { transport, fetchImpl, cacheTtlMs: 60_000 });
    await finance.wishlist.list({});
    await finance.wishlist.list({});
    await finance.wishlist.list({});
    expect(transport.callCount).toBe(1);
  });

  it('shares the in-flight discovery promise across concurrent calls', async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar()],
      delayMs: 30,
    });
    const { fetchImpl } = restFetch(() => jsonResponse(null));
    const finance = pillar('finance', { transport, fetchImpl });
    await Promise.all([
      finance.wishlist.list({}),
      finance.wishlist.list({}),
      finance.wishlist.list({}),
    ]);
    expect(transport.callCount).toBe(1);
  });

  it('refreshes after TTL expiry', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => jsonResponse(null));
    const finance = pillar('finance', { transport, fetchImpl, cacheTtlMs: 5 });
    await finance.wishlist.list({});
    await new Promise((r) => setTimeout(r, 10));
    await finance.wishlist.list({});
    expect(transport.callCount).toBe(2);
  });
});

describe('pillar() factory — routing edge cases (REST transport)', () => {
  beforeEach(resetClients);
  afterEach(resetClients);

  it('builds nested router.subRouter.procedure operationIds', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = restFetch(() => jsonResponse('ok'));
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.transactions.imports.create({ id: '1' });
    expect(calls[0]?.url).toBe('http://finance-api:3004/transactions/imports/create');
    expect(calls[0]?.body).toEqual({ id: '1' });
  });

  it("returns 'contract-mismatch' when the consumer calls a top-level leaf with only one path segment", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = restFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist();
    expect(result.kind).toBe('contract-mismatch');
  });

  it('strips a trailing slash from the discovered baseUrl', async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar({ baseUrl: 'http://finance-api:3004/' })],
    });
    const { fetchImpl, calls } = restFetch(() => jsonResponse(null));
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.wishlist.list({});
    expect(calls[0]?.url).toBe('http://finance-api:3004/wishlist/list');
  });
});
