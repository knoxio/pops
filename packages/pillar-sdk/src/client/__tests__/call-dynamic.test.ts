import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isOk } from '../errors.js';
import { __resetSharedPillarClient, pillar } from '../factory.js';
import {
  discoveredPillar,
  fakeFetch,
  FakeRegistryTransport,
  jsonResponse,
  type FakeFetchHandler,
} from './fixtures.js';

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

describe('pillar().callDynamic — runtime path dispatch', () => {
  beforeEach(() => __resetSharedPillarClient());
  afterEach(() => __resetSharedPillarClient());

  it('dispatches to <baseUrl>/trpc/<pillar>.<router>.<proc> matching the typed proxy', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ result: { data: [{ id: 'wish-1' }] } })
    );
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.callDynamic('wishlist', 'list', { limit: 5 });
    expect(isOk(result)).toBe(true);
    if (result.kind === 'ok') {
      expect(result.value).toEqual([{ id: 'wish-1' }]);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://finance-api:3004/trpc/finance.wishlist.list');
    expect(calls[0]?.body).toEqual({ limit: 5 });
  });

  it('passes input through verbatim — no zod / shape validation in the SDK layer', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ result: { data: { ok: true } } })
    );
    const finance = pillar('finance', { transport, fetchImpl });
    const weirdInput = { nested: { deeply: [1, 2, 3] }, flag: false };
    await finance.callDynamic('wishlist', 'list', weirdInput);
    expect(calls[0]?.body).toEqual(weirdInput);
  });

  it('serialises an omitted input as null (matches typed proxy)', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ result: { data: null } }));
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.callDynamic('wishlist', 'list');
    expect(calls[0]?.body).toBeNull();
  });

  it("kind='mutation' routes through the same transport as kind='query'", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ result: { data: { id: 'created' } } })
    );
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.callDynamic('wishlist', 'create', { name: 'x' }, 'mutation');
    expect(result.kind).toBe('ok');
    expect(calls[0]?.url).toBe('http://finance-api:3004/trpc/finance.wishlist.create');
  });

  it("returns 'unavailable' when the pillar is offline", async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const { fetchImpl } = recordingFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.callDynamic('wishlist', 'list', {});
    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') expect(result.pillar).toBe('finance');
  });

  it("returns 'contract-mismatch' when the procedure path doesn't exist (404)", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const fetchImpl = fakeFetch(() => new Response('not found', { status: 404 }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.callDynamic('wishlist', 'doesNotExist', {});
    expect(result.kind).toBe('contract-mismatch');
    if (result.kind === 'contract-mismatch') {
      expect(result.expected).toBe('finance.wishlist.doesNotExist');
    }
  });

  it('shares the discovery cache with the typed proxy (single lookup for both)', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = recordingFetch(() => jsonResponse({ result: { data: null } }));
    const finance = pillar('finance', { transport, fetchImpl, cacheTtlMs: 60_000 });
    await finance.wishlist.list({});
    await finance.callDynamic('wishlist', 'list', {});
    await finance.callDynamic('budgets', 'list', {});
    expect(transport.callCount).toBe(1);
  });
});
