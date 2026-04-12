/**
 * Base *arr client tests — uses mocked fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArrBaseClient } from './base-client.js';
import { ArrApiError } from './types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

// Expose protected get() for cache testing
class TestableClient extends ArrBaseClient {
  async fetch<T>(path: string): Promise<T> {
    return this.get<T>(path);
  }
}

describe('ArrBaseClient', () => {
  let client: ArrBaseClient;

  beforeEach(() => {
    client = new ArrBaseClient('http://localhost:7878', 'test-api-key');
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('testConnection returns system status', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: '5.1.0', appName: 'Radarr' }));

    const result = await client.testConnection();

    expect(result.version).toBe('5.1.0');
    expect(result.appName).toBe('Radarr');
  });

  it('sends X-Api-Key header', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: '1.0', appName: 'Test' }));

    await client.testConnection();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:7878/api/v3/system/status',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Api-Key': 'test-api-key',
        }),
      })
    );
  });

  it('strips trailing slash from base URL', async () => {
    const c = new ArrBaseClient('http://localhost:7878/', 'key');
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: '1.0', appName: 'Test' }));

    await c.testConnection();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:7878/api/v3/'),
      expect.anything()
    );
  });

  it('throws ArrApiError on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
    );

    await expect(client.testConnection()).rejects.toThrow(ArrApiError);

    try {
      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', {
          status: 401,
          statusText: 'Unauthorized',
        })
      );
      await client.testConnection();
    } catch (err) {
      expect((err as ArrApiError).status).toBe(401);
    }
  });

  it('throws ArrApiError on 404', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Not Found', { status: 404, statusText: 'Not Found' })
    );

    await expect(client.testConnection()).rejects.toThrow(ArrApiError);
  });

  it('sets AbortSignal timeout on fetch calls', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: '1.0', appName: 'Test' }));

    await client.testConnection();

    const options = mockFetch.mock.calls[0]![1] as { signal?: AbortSignal };
    expect(options.signal).toBeDefined();
  });
});

describe('ArrBaseClient caching', () => {
  let client: TestableClient;

  beforeEach(() => {
    client = new TestableClient('http://localhost:7878', 'test-api-key');
    mockFetch.mockReset();
  });

  it('returns cached data on second call within TTL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ movies: [1, 2, 3] }));

    const first = await client.fetch('/movie');
    const second = await client.fetch('/movie');

    expect(first).toEqual({ movies: [1, 2, 3] });
    expect(second).toEqual({ movies: [1, 2, 3] });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('fetches again after cache TTL expires', async () => {
    vi.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ v: 1 }))
      .mockResolvedValueOnce(jsonResponse({ v: 2 }));

    await client.fetch('/movie');
    vi.advanceTimersByTime(31_000);

    const result = await client.fetch('/movie');
    expect(result).toEqual({ v: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('clearCache() flushes all cached entries', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ v: 1 }))
      .mockResolvedValueOnce(jsonResponse({ v: 2 }));

    await client.fetch('/movie');
    client.clearCache();

    const result = await client.fetch('/movie');
    expect(result).toEqual({ v: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('maintains separate caches per client instance', async () => {
    const radarr = new TestableClient('http://radarr:7878', 'key-r');
    const sonarr = new TestableClient('http://sonarr:8989', 'key-s');

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ from: 'radarr' }))
      .mockResolvedValueOnce(jsonResponse({ from: 'sonarr' }));

    const r = await radarr.fetch('/system/status');
    const s = await sonarr.fetch('/system/status');

    expect(r).toEqual({ from: 'radarr' });
    expect(s).toEqual({ from: 'sonarr' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("caches are keyed by full URL (different paths don't collide)", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ type: 'movie' }))
      .mockResolvedValueOnce(jsonResponse({ type: 'queue' }));

    const movies = await client.fetch('/movie');
    const queue = await client.fetch('/queue');

    expect(movies).toEqual({ type: 'movie' });
    expect(queue).toEqual({ type: 'queue' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('clearCache on one instance does not affect another', async () => {
    const clientA = new TestableClient('http://radarr:7878', 'key');
    const clientB = new TestableClient('http://sonarr:8989', 'key');

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ v: 'a' }))
      .mockResolvedValueOnce(jsonResponse({ v: 'b' }));

    await clientA.fetch('/movie');
    await clientB.fetch('/series');

    clientA.clearCache();

    // clientB cache should still be intact
    await clientB.fetch('/series');
    expect(mockFetch).toHaveBeenCalledTimes(2); // no extra call for clientB
  });
});
