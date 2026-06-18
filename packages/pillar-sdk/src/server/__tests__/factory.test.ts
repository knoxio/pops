import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoveredPillar,
  fakeFetch,
  FakeRegistryTransport,
  FINANCE_OPENAPI,
  jsonResponse,
} from '../../client/__tests__/fixtures.js';
import { __resetSharedOpenApiCache, __resetSharedPillarClient, isOk } from '../../client/index.js';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
  pillar,
  PillarServerSdkError,
  SERVER_SDK_API_KEY_ENV,
} from '../index.js';

type FetchCall = { url: string; headers: Record<string, string>; body: unknown };

/**
 * Records only the domain (REST) call, transparently serving the target
 * pillar's OpenAPI document on `GET ${baseUrl}/openapi` so the client's
 * `getRouteMap` step succeeds. The OpenAPI fetch is intentionally NOT recorded
 * so `calls[0]` is always the domain call under test (header/url assertions).
 */
function recordingFetch(responder: (url: string) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl = fakeFetch(async (url, init) => {
    if (url.endsWith('/openapi')) return jsonResponse(FINANCE_OPENAPI);
    const rawBody = typeof init?.body === 'string' ? init.body : '';
    let parsed: unknown = null;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsed = rawBody;
    }
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: parsed,
    });
    return responder(url);
  });
  return { fetchImpl, calls };
}

type WishlistRouter = {
  wishlist: {
    list: (input: { limit: number }) => Promise<readonly { id: string }[]>;
  };
};

const ORIGINAL_API_KEY = process.env[SERVER_SDK_API_KEY_ENV];

function clearApiKeyEnv(): void {
  delete process.env[SERVER_SDK_API_KEY_ENV];
}

function resetAll(): void {
  __resetServerSdkConfig();
  __resetServerPillarCache();
  __resetSharedPillarClient();
  __resetSharedOpenApiCache();
}

describe('server pillar() — auth bootstrapping', () => {
  beforeEach(() => {
    resetAll();
    clearApiKeyEnv();
  });

  afterEach(() => {
    resetAll();
    if (ORIGINAL_API_KEY === undefined) clearApiKeyEnv();
    else process.env[SERVER_SDK_API_KEY_ENV] = ORIGINAL_API_KEY;
  });

  it('throws PillarServerSdkError when neither config nor env supplies a key', () => {
    expect(() => pillar('finance')).toThrowError(PillarServerSdkError);
  });

  it('mentions both knobs in the error so the caller can self-diagnose', () => {
    try {
      pillar('finance');
    } catch (err) {
      expect(err).toBeInstanceOf(PillarServerSdkError);
      if (err instanceof PillarServerSdkError) {
        expect(err.message).toContain(SERVER_SDK_API_KEY_ENV);
        expect(err.message).toContain('configureServerSdk');
      }
    }
  });

  it('accepts the env var alone', () => {
    process.env[SERVER_SDK_API_KEY_ENV] = 'env-key';
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    expect(() => pillar('finance', { transport })).not.toThrow();
  });

  it('accepts a configured key alone', () => {
    configureServerSdk({ apiKey: 'config-key' });
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    expect(() => pillar('finance', { transport })).not.toThrow();
  });
});

describe('server pillar() — outbound auth header', () => {
  beforeEach(() => {
    resetAll();
    clearApiKeyEnv();
    configureServerSdk({ apiKey: 'svc-key-123' });
  });

  afterEach(() => {
    resetAll();
    if (ORIGINAL_API_KEY === undefined) clearApiKeyEnv();
    else process.env[SERVER_SDK_API_KEY_ENV] = ORIGINAL_API_KEY;
  });

  it("sends the service-account key as 'X-API-Key' on every call", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ result: { data: [{ id: 'wish-1' }] } })
    );
    const finance = pillar<WishlistRouter>('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({ limit: 1 });
    expect(isOk(result)).toBe(true);
    expect(calls[0]?.headers['x-api-key']).toBe('svc-key-123');
  });

  it('does not pass through nginx — uses the registry-published baseUrl directly', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ result: { data: null } }));
    const finance = pillar<WishlistRouter>('finance', { transport, fetchImpl });
    await finance.wishlist.list({ limit: 1 });
    expect(calls[0]?.url).toBe('http://finance-api:3004/wishlist/list');
  });

  it('reads the env-supplied key at call time so a later env update is picked up', async () => {
    __resetServerSdkConfig();
    process.env[SERVER_SDK_API_KEY_ENV] = 'env-a';
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ result: { data: null } }));
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.wishlist.list({});
    expect(calls.at(-1)?.headers['x-api-key']).toBe('env-a');

    process.env[SERVER_SDK_API_KEY_ENV] = 'env-b';
    await finance.wishlist.list({});
    expect(calls.at(-1)?.headers['x-api-key']).toBe('env-b');
  });
});

describe('server pillar() — handle reuse + discovery cache', () => {
  beforeEach(() => {
    resetAll();
    clearApiKeyEnv();
    configureServerSdk({ apiKey: 'svc-key' });
  });

  afterEach(() => {
    resetAll();
    if (ORIGINAL_API_KEY === undefined) clearApiKeyEnv();
    else process.env[SERVER_SDK_API_KEY_ENV] = ORIGINAL_API_KEY;
  });

  it('memoises the per-pillar handle so the discovery cache survives across pillar() calls', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = recordingFetch(() => jsonResponse({ result: { data: null } }));
    const a = pillar('finance', { transport, fetchImpl, cacheTtlMs: 60_000 });
    const b = pillar('finance', { transport, fetchImpl, cacheTtlMs: 60_000 });
    expect(a).toBe(b);
    await a.wishlist.list({});
    await b.wishlist.list({});
    expect(transport.callCount).toBe(1);
  });

  it('rebuilds the handle when the configured api key changes', async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = recordingFetch(() => jsonResponse({ result: { data: null } }));
    const a = pillar('finance', { transport, fetchImpl });
    configureServerSdk({ apiKey: 'rotated-key' });
    const b = pillar('finance', { transport, fetchImpl });
    expect(a).not.toBe(b);
  });
});

describe('server pillar() — internal base URL overrides', () => {
  beforeEach(() => {
    resetAll();
    clearApiKeyEnv();
    configureServerSdk({ apiKey: 'svc-key' });
  });

  afterEach(() => {
    resetAll();
    if (ORIGINAL_API_KEY === undefined) clearApiKeyEnv();
    else process.env[SERVER_SDK_API_KEY_ENV] = ORIGINAL_API_KEY;
  });

  it('routes calls to the override URL for matching pillars', async () => {
    configureServerSdk({ internalBaseUrls: { finance: 'http://localhost:3104' } });
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ result: { data: null } }));
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.wishlist.list({});
    expect(calls[0]?.url).toBe('http://localhost:3104/wishlist/list');
  });

  it('leaves the URL untouched for pillars that are not in the override map', async () => {
    configureServerSdk({ internalBaseUrls: { media: 'http://localhost:3105' } });
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ result: { data: null } }));
    const finance = pillar('finance', { transport, fetchImpl });
    await finance.wishlist.list({});
    expect(calls[0]?.url).toBe('http://finance-api:3004/wishlist/list');
  });
});

describe('server pillar() — error-mapping parity with client', () => {
  beforeEach(() => {
    resetAll();
    clearApiKeyEnv();
    configureServerSdk({ apiKey: 'svc-key' });
  });

  afterEach(() => {
    resetAll();
    if (ORIGINAL_API_KEY === undefined) clearApiKeyEnv();
    else process.env[SERVER_SDK_API_KEY_ENV] = ORIGINAL_API_KEY;
  });

  it("returns 'unavailable' when the pillar is missing from the registry", async () => {
    const transport = new FakeRegistryTransport({ pillars: [] });
    const { fetchImpl } = recordingFetch(() => jsonResponse({}));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('unavailable');
  });

  it("returns 'not-found' on a 404 from the pillar", async () => {
    const transport = new FakeRegistryTransport({ pillars: [discoveredPillar()] });
    const { fetchImpl } = recordingFetch(() => new Response('not found', { status: 404 }));
    const finance = pillar('finance', { transport, fetchImpl });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('not-found');
  });

  it('flags a contract major skew when contractVersion is pinned', async () => {
    const transport = new FakeRegistryTransport({
      pillars: [
        discoveredPillar({
          manifest: {
            ...discoveredPillar().manifest,
            contract: {
              package: '@pops/finance-contract',
              version: '2.0.0',
              tag: 'contract-finance@v2.0.0',
            },
          },
        }),
      ],
    });
    const { fetchImpl } = recordingFetch(() => jsonResponse({}));
    const finance = pillar('finance', {
      transport,
      fetchImpl,
      contractVersion: '1.4.0',
    });
    const result = await finance.wishlist.list({});
    expect(result.kind).toBe('contract-mismatch');
  });
});
