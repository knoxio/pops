/**
 * Wire-format regression tests. These pin the request/response shape the CLI
 * speaks to the cerebrum pillar REST API, so a future change to either side
 * breaks here instead of silently failing in the field.
 *
 * The cerebrum REST surface takes the request body as raw JSON, returns the
 * value verbatim on success, and a `{ message, code? }` envelope on failure
 * (see `pillars/cerebrum/src/contract`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, ApiUnreachableError, restMutation } from '../api-client.js';
import { getFetchCall, getFetchJson, mockFetchOk, mockFetchRestError } from './test-helpers.js';

describe('restMutation wire format', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to the REST path with the input as a raw JSON object', async () => {
    const spy = mockFetchOk({ id: 'eng_x' });
    await restMutation({ apiUrl: 'http://api.test', apiKey: undefined }, '/ingest/quick-capture', {
      text: 'hi',
      source: 'cli',
    });
    const { url, init } = getFetchCall(spy);
    expect(url).toBe('http://api.test/ingest/quick-capture');
    expect(init.method).toBe('POST');
    expect(getFetchJson(spy)).toEqual({ text: 'hi', source: 'cli' });
  });

  it('reads the success payload verbatim (no envelope unwrap)', async () => {
    mockFetchOk({
      id: 'eng_x',
      path: 'capture/eng_x.md',
      type: 'capture',
      scopes: ['a'],
      requeued: false,
    });
    const result = await restMutation<{ id: string }>(
      { apiUrl: 'http://api.test', apiKey: undefined },
      '/ingest/quick-capture',
      { text: 'hi' }
    );
    expect(result).toEqual({
      id: 'eng_x',
      path: 'capture/eng_x.md',
      type: 'capture',
      scopes: ['a'],
      requeued: false,
    });
  });

  it('surfaces REST errors from the `{ message, code }` envelope', async () => {
    mockFetchRestError('text must be a non-empty string', 400, 'BAD_REQUEST');
    const call = restMutation(
      { apiUrl: 'http://api.test', apiKey: undefined },
      '/ingest/quick-capture',
      { text: '' }
    );
    await expect(call).rejects.toBeInstanceOf(ApiError);
    await expect(call).rejects.toThrow(/text must be a non-empty string/);
    await expect(call).rejects.toMatchObject({ code: 'BAD_REQUEST', httpStatus: 400 });
  });

  it('forwards X-API-Key when the config supplies a key', async () => {
    const spy = mockFetchOk({ answer: 'ok', sources: [], scopes: [], confidence: 'high' });
    await restMutation({ apiUrl: 'http://api.test', apiKey: 'pops_sa_abc' }, '/query/ask', {
      question: 'hi',
    });
    const { init } = getFetchCall(spy);
    const headers = init.headers;
    expect(headers).toBeDefined();
    if (headers && !(headers instanceof Headers) && !Array.isArray(headers)) {
      expect(headers['x-api-key']).toBe('pops_sa_abc');
    } else {
      throw new Error('expected plain-object headers');
    }
  });

  it('wraps fetch-failure errors as ApiUnreachableError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );
    await expect(
      restMutation(
        { apiUrl: 'http://localhost:9999', apiKey: undefined },
        '/ingest/quick-capture',
        {
          text: 'hi',
        }
      )
    ).rejects.toBeInstanceOf(ApiUnreachableError);
  });
});
