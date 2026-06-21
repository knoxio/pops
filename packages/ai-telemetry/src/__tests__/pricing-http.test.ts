import { describe, expect, it, vi } from 'vitest';

import { httpLookupPricing } from '../pricing-http.js';

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('httpLookupPricing', () => {
  it('uses the dedicated /ai-pricing route when present', async () => {
    const fetchImpl = vi.fn<FetchImpl>((input) =>
      Promise.resolve(
        String(input).includes('/ai-pricing/')
          ? json({ input: 3, output: 15 })
          : new Response(null, { status: 404 })
      )
    );
    const lookup = httpLookupPricing('http://ai-api:3008', fetchImpl);
    expect(await lookup('anthropic', 'claude-haiku-4-5')).toEqual({ input: 3, output: 15 });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      '/ai-pricing/anthropic/claude-haiku-4-5'
    );
  });

  it('falls back to /ai-providers mapping when the dedicated route 404s', async () => {
    const fetchImpl = vi.fn<FetchImpl>((input) => {
      if (String(input).includes('/ai-pricing/'))
        return Promise.resolve(new Response(null, { status: 404 }));
      if (String(input).endsWith('/ai-providers')) {
        return Promise.resolve(
          json([
            {
              id: 'anthropic',
              models: [{ model: 'claude-haiku-4-5', inputCostPerMtok: 0.8, outputCostPerMtok: 4 }],
            },
          ])
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    // trailing slash is trimmed
    const lookup = httpLookupPricing('http://ai-api:3008/', fetchImpl);
    expect(await lookup('anthropic', 'claude-haiku-4-5')).toEqual({ input: 0.8, output: 4 });
  });

  it('returns null when neither route resolves', async () => {
    const fetchImpl = vi.fn<FetchImpl>(() => Promise.resolve(new Response(null, { status: 404 })));
    expect(await httpLookupPricing('http://ai-api:3008', fetchImpl)('x', 'y')).toBeNull();
  });

  it('returns null and never throws on a network error', async () => {
    const fetchImpl = vi.fn<FetchImpl>(() => Promise.reject(new Error('ECONNREFUSED')));
    expect(await httpLookupPricing('http://ai-api:3008', fetchImpl)('x', 'y')).toBeNull();
  });
});
