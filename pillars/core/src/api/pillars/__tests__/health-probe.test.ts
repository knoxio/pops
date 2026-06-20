/**
 * Tests for the cross-pillar health probe (ADR-026 P3).
 *
 * Relocated from `apps/pops-api/src/modules/core/pillars/health-probe.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import { probeAllPillars, probePillarHealth } from '../health-probe.js';

import type { PillarRegistryEntry } from '@pops/types';

const FOOD: PillarRegistryEntry = { id: 'food', baseUrl: 'http://food-api:3000' };
const FINANCE: PillarRegistryEntry = { id: 'finance', baseUrl: 'http://finance-api:3000' };
const CORE_REMOTE: PillarRegistryEntry = { id: 'core', baseUrl: 'http://core-api:3000' };

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('probePillarHealth', () => {
  it('reports healthy on a well-shaped 200 response with matching pillar id', async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse({ ok: true, pillar: 'food', version: '1.0.0' })
    );
    const status = await probePillarHealth(FOOD, { fetch: fetchStub });
    expect(status).toBe('healthy');
    expect(fetchStub).toHaveBeenCalledWith(
      'http://food-api:3000/health',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('reports unavailable when the response status is non-2xx', async () => {
    const fetchStub = vi.fn(async () => new Response('down', { status: 503 }));
    expect(await probePillarHealth(FOOD, { fetch: fetchStub })).toBe('unavailable');
  });

  it('reports unavailable when the body is not the PillarHealth shape', async () => {
    const fetchStub = vi.fn(async () => jsonResponse({ status: 'ok' }));
    expect(await probePillarHealth(FOOD, { fetch: fetchStub })).toBe('unavailable');
  });

  it('reports unavailable when the body pillar id mismatches the registry entry', async () => {
    const fetchStub = vi.fn(async () =>
      jsonResponse({ ok: true, pillar: 'finance', version: '1.0.0' })
    );
    expect(await probePillarHealth(FOOD, { fetch: fetchStub })).toBe('unavailable');
  });

  it('reports unavailable when fetch throws (network failure)', async () => {
    const fetchStub = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await probePillarHealth(FOOD, { fetch: fetchStub })).toBe('unavailable');
  });

  it('aborts and reports unavailable when the probe exceeds timeoutMs', async () => {
    const fetchStub = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      });
      throw new Error('unreachable');
    });
    const status = await probePillarHealth(FOOD, { fetch: fetchStub, timeoutMs: 5 });
    expect(status).toBe('unavailable');
  });
});

describe('probeAllPillars', () => {
  it('returns an empty map for an empty registry', async () => {
    expect(await probeAllPillars([])).toEqual({});
  });

  it('short-circuits the self-pillar to healthy without HTTP', async () => {
    const fetchStub = vi.fn();
    const map = await probeAllPillars([{ id: 'core', baseUrl: '' }], { fetch: fetchStub });
    expect(map).toEqual({ core: 'healthy' });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('short-circuits the self-pillar even if a baseUrl is configured', async () => {
    const fetchStub = vi.fn();
    const map = await probeAllPillars([CORE_REMOTE], { fetch: fetchStub });
    expect(map).toEqual({ core: 'healthy' });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('fans out one probe per remote pillar concurrently', async () => {
    const calls: string[] = [];
    const fetchStub = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      return jsonResponse({
        ok: true,
        pillar: String(url).includes('food') ? 'food' : 'finance',
        version: 'dev',
      });
    });
    const map = await probeAllPillars([FOOD, FINANCE], { fetch: fetchStub });
    expect(map).toEqual({ food: 'healthy', finance: 'healthy' });
    expect(calls).toHaveLength(2);
  });

  it('reports unavailable for the failing pillar and healthy for the others', async () => {
    const fetchStub = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('food')) throw new TypeError('boom');
      return jsonResponse({ ok: true, pillar: 'finance', version: 'dev' });
    });
    const map = await probeAllPillars([FOOD, FINANCE], { fetch: fetchStub });
    expect(map).toEqual({ food: 'unavailable', finance: 'healthy' });
  });

  it('honours a custom selfPillarId', async () => {
    const fetchStub = vi.fn();
    const map = await probeAllPillars([{ id: 'finance', baseUrl: '' }], {
      fetch: fetchStub,
      selfPillarId: 'finance',
    });
    expect(map).toEqual({ finance: 'healthy' });
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
