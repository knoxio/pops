/**
 * Tests for the shell-side pillar boot HTTP client (ADR-026 P3).
 */
import { describe, expect, it, vi } from 'vitest';

import { fetchPillarHealth, fetchPillarRegistry } from './pillar-registry-client';

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchPillarRegistry', () => {
  it('returns the parsed pillar list from /pillars', async () => {
    const fetchStub = vi.fn(async (url) => {
      expect(url).toBe('/pillars');
      return jsonResponse({
        pillars: [
          { id: 'registry', baseUrl: '' },
          { id: 'food', baseUrl: 'http://food-api:3000' },
        ],
      });
    });
    const entries = await fetchPillarRegistry({ fetch: fetchStub });
    expect(entries).toEqual([
      { id: 'registry', baseUrl: '' },
      { id: 'food', baseUrl: 'http://food-api:3000' },
    ]);
  });

  it('falls back to the synthetic registry self-entry when /pillars returns an empty list', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ pillars: [] }));
    const entries = await fetchPillarRegistry({ fetch: fetchStub });
    expect(entries).toEqual([{ id: 'registry', baseUrl: '' }]);
  });

  it('falls back to the synthetic registry self-entry on network failure', async () => {
    const fetchStub = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const entries = await fetchPillarRegistry({ fetch: fetchStub });
    expect(entries).toEqual([{ id: 'registry', baseUrl: '' }]);
  });

  it('falls back when the response is a 500', async () => {
    const fetchStub = vi.fn(async () => new Response('boom', { status: 500 }));
    const entries = await fetchPillarRegistry({ fetch: fetchStub });
    expect(entries).toEqual([{ id: 'registry', baseUrl: '' }]);
  });

  it('falls back when the response body is malformed', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ pillars: [{ id: 'food' }] }));
    const entries = await fetchPillarRegistry({ fetch: fetchStub });
    expect(entries).toEqual([{ id: 'registry', baseUrl: '' }]);
  });

  it('falls back when the body is not the {pillars: [...]} shape', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ entries: [] }));
    const entries = await fetchPillarRegistry({ fetch: fetchStub });
    expect(entries).toEqual([{ id: 'registry', baseUrl: '' }]);
  });

  it('aborts and falls back when the fetch exceeds timeoutMs', async () => {
    const fetchStub = vi.fn(async (_url, init?: RequestInit) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      });
      throw new Error('unreachable');
    });
    const entries = await fetchPillarRegistry({ fetch: fetchStub, timeoutMs: 5 });
    expect(entries).toEqual([{ id: 'registry', baseUrl: '' }]);
  });
});

describe('fetchPillarHealth', () => {
  it('returns the parsed health map from /pillars/health', async () => {
    const fetchStub = vi.fn(async (url) => {
      expect(url).toBe('/pillars/health');
      return jsonResponse({
        health: { core: 'healthy', food: 'unavailable' },
      });
    });
    const map = await fetchPillarHealth({ fetch: fetchStub });
    expect(map).toEqual({ core: 'healthy', food: 'unavailable' });
  });

  it('drops unknown status strings from the map', async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse({ health: { core: 'healthy', food: 'partial', finance: 'unavailable' } })
    );
    const map = await fetchPillarHealth({ fetch: fetchStub });
    expect(map).toEqual({ core: 'healthy', finance: 'unavailable' });
  });

  it('returns an empty map on network failure', async () => {
    const fetchStub = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await fetchPillarHealth({ fetch: fetchStub })).toEqual({});
  });

  it('returns an empty map on a non-2xx response', async () => {
    const fetchStub = vi.fn(async () => new Response('boom', { status: 502 }));
    expect(await fetchPillarHealth({ fetch: fetchStub })).toEqual({});
  });

  it('returns an empty map when the body is malformed', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({}));
    expect(await fetchPillarHealth({ fetch: fetchStub })).toEqual({});
  });

  it('aborts and returns an empty map when the fetch exceeds timeoutMs', async () => {
    const fetchStub = vi.fn(async (_url, init?: RequestInit) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      });
      throw new Error('unreachable');
    });
    const map = await fetchPillarHealth({ fetch: fetchStub, timeoutMs: 5 });
    expect(map).toEqual({});
  });
});
