/**
 * PRD-127 — fetchHtml unit tests.
 */
import { describe, expect, it } from 'vitest';

import { fetchHtml } from '../handlers/web/fetch-html.js';

function makeResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });
}

describe('fetchHtml', () => {
  it('returns the body on a 200 text/html response', async () => {
    const fetchImpl = (async () => makeResponse('<html>ok</html>')) as typeof fetch;
    const result = await fetchHtml('https://example.test/ok', { fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.html).toBe('<html>ok</html>');
    expect(result.status).toBe(200);
  });

  it('follows redirects and reports the final URL', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      if (url.endsWith('/start')) {
        return new Response(null, {
          status: 301,
          headers: { location: 'https://example.test/end' },
        });
      }
      return makeResponse('<html>end</html>');
    }) as unknown as typeof fetch;
    const result = await fetchHtml('https://example.test/start', { fetchImpl });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.finalUrl).toBe('https://example.test/end');
    expect(calls).toEqual(['https://example.test/start', 'https://example.test/end']);
  });

  it('rejects when the redirect chain exceeds the cap', async () => {
    const fetchImpl: typeof fetch = (async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      const next = url + '/x';
      return new Response(null, { status: 302, headers: { location: next } });
    }) as unknown as typeof fetch;
    const result = await fetchHtml('https://example.test/loop', { fetchImpl, maxRedirects: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('FetchFailed');
  });

  it('rejects non-HTML content types', async () => {
    const fetchImpl = (async () =>
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const result = await fetchHtml('https://example.test/json', { fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('NotHtml');
  });

  it('rejects 4xx as FetchFailed with the status', async () => {
    const fetchImpl = (async () =>
      new Response('nope', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      })) as typeof fetch;
    const result = await fetchHtml('https://example.test/404', { fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('FetchFailed');
    expect(result.status).toBe(404);
  });

  it('rejects bodies larger than the configured cap', async () => {
    const big = 'x'.repeat(2048);
    const fetchImpl = (async () => makeResponse(big)) as typeof fetch;
    const result = await fetchHtml('https://example.test/big', {
      fetchImpl,
      maxBodyBytes: 1024,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('BodyTooLarge');
  });

  it('returns FetchTimeout when the underlying fetch times out', async () => {
    const fetchImpl: typeof fetch = (async () => {
      const err = new Error('signal aborted');
      err.name = 'TimeoutError';
      throw err;
    }) as unknown as typeof fetch;
    const result = await fetchHtml('https://example.test/slow', { fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('FetchTimeout');
  });

  it('returns FetchFailed when fetch throws a generic error', async () => {
    const fetchImpl: typeof fetch = (async () => {
      throw new Error('connection reset');
    }) as unknown as typeof fetch;
    const result = await fetchHtml('https://example.test/boom', { fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('FetchFailed');
  });
});
