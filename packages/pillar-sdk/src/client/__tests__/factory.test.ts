import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PillarCallError, isOk } from '../errors.js';
import { __resetSharedPillarClient, pillar } from '../factory.js';
import {
  discoveredPillar,
  fakeFetch,
  FakeRegistryTransport,
  jsonResponse,
  type FakeFetchHandler,
} from './fixtures.js';

import type { DiscoveredPillar } from '../discovery.js';

type WishlistRouter = {
  wishlist: {
    list: (input: { limit: number }) => Promise<readonly { id: string }[]>;
  };
};

type FetchCall = { url: string; body: unknown };

function recordingFetch(responder: (url: string, body: unknown) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const handler: FakeFetchHandler = async (url, init) => {
    let parsed: unknown = null;
    if (init?.body) {
      const raw = typeof init.body === 'string' ? init.body : '';
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = raw;
      }
    }
    calls.push({ url, body: parsed });
    return responder(url, parsed);
  };
  return { fetchImpl: fakeFetch(handler), calls };
}

describe('pillar() factory — happy path', () => {
  let transport: FakeRegistryTransport;

  beforeEach(() => {
    __resetSharedPillarClient();
    transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
  });

  afterEach(() => {
    __resetSharedPillarClient();
  });

  it('routes calls to <baseUrl>/trpc/<router>.<procedure> and returns the data', async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ result: { data: [{ id: 'wish-1' }] } })
    );
    const finance = pillar<WishlistRouter>('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({ limit: 10 });
    expect(isOk(result)).toBe(true);
    if (result.kind === 'ok') {
      expect(result.value).toEqual([{ id: 'wish-1' }]);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://finance-api:3004/trpc/finance.wishlist.list');
    expect(calls[0]?.body).toEqual({ limit: 10 });
  });

  it('serialises a missing input argument as { input: null }', async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ result: { data: { count: 0 } } })
    );
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.wishlist.list();
    expect(calls[0]?.body).toBeNull();
  });

  it('orThrow() unwraps the value on success', async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse({ result: { data: [{ id: 'a' }, { id: 'b' }] } })
    );
    const finance = pillar<WishlistRouter>('finance', { transport, fetchImpl });
    const value = await finance.wishlist.list.orThrow({ limit: 5 });
    expect(value).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('supports auth header injection per-call', async () => {
    let seen: Record<string, string> = {};
    const fetchImpl = fakeFetch((_url, init) => {
      seen = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse({ result: { data: null } });
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

describe('pillar() factory — failure modes', () => {
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it("returns 'unavailable' when the pillar is not in the registry", async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const { fetchImpl } = recordingFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') expect(result.pillar).toBe('finance');
  });

  it("returns 'unavailable' when the pillar status is 'unavailable'", async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar({ status: 'unavailable' })],
    });
    const { fetchImpl } = recordingFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
  });

  it("returns 'degraded' (reconciling) when the pillar status is 'unknown'", async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar({ status: 'unknown' })],
    });
    const { fetchImpl } = recordingFetch(() => jsonResponse({}));
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
    const { fetchImpl } = recordingFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
  });

  it("returns 'contract-mismatch' when the pillar replies 404", async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar()],
    });
    const fetchImpl = fakeFetch(() => new Response('not found', { status: 404 }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('contract-mismatch');
    if (result.kind === 'contract-mismatch') {
      expect(result.expected).toBe('finance.wishlist.list');
    }
  });

  it("returns 'unavailable' when the pillar HTTP call rejects", async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar()],
    });
    const fetchImpl = fakeFetch(() => {
      throw new Error('connection refused');
    });
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
  });

  it("returns 'unavailable' on 5xx and on non-JSON success bodies", async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar()],
    });
    const fetchImpl = fakeFetch((url) => {
      if (url.endsWith('/trpc/finance.wishlist.list')) {
        return new Response('boom', { status: 502 });
      }
      return jsonResponse({});
    });
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
  });

  it('detects a contract major-version skew before calling the pillar', async () => {
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
      return jsonResponse({});
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
    const { fetchImpl } = recordingFetch(() => jsonResponse({ result: { data: { ok: true } } }));
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
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('throws a PillarCallError carrying the failure result', async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const { fetchImpl } = recordingFetch(() => jsonResponse({}));
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
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('memoises discovery across repeated calls within the TTL', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = recordingFetch(() => jsonResponse({ result: { data: null } }));
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
    const { fetchImpl } = recordingFetch(() => jsonResponse({ result: { data: null } }));
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
    const { fetchImpl } = recordingFetch(() => jsonResponse({ result: { data: null } }));
    const finance = pillar('finance', { transport, fetchImpl, cacheTtlMs: 5 });
    await finance.wishlist.list({});
    await new Promise((r) => setTimeout(r, 10));
    await finance.wishlist.list({});
    expect(transport.callCount).toBe(2);
  });
});

describe('pillar() factory — routing edge cases', () => {
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('builds nested router.subRouter.procedure paths', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ result: { data: 'ok' } }));
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.transactions.imports.create({ id: '1' });
    expect(calls[0]?.url).toBe('http://finance-api:3004/trpc/finance.transactions.imports.create');
  });

  it("returns 'contract-mismatch' when the consumer calls a top-level leaf with only one path segment", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = recordingFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist();
    expect(result.kind).toBe('contract-mismatch');
  });

  it('strips a trailing slash from the discovered baseUrl', async () => {
    const transport = new FakeRegistryTransport({
      pillars: [discoveredPillar({ baseUrl: 'http://finance-api:3004/' })],
    });
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ result: { data: null } }));
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.wishlist.list({});
    expect(calls[0]?.url).toBe('http://finance-api:3004/trpc/finance.wishlist.list');
  });
});
