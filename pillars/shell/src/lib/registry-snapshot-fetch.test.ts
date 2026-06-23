/**
 * Shared registry-snapshot fetcher tests (P7-T03).
 *
 * Pins the canonical URL, the `{ pillars }` parse, and the soft-fail-to-`[]`
 * contract every consumer (Settings UI, boot install-set) relies on.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  fetchRegistrySnapshot,
  normaliseSnapshotEntry,
  parseSnapshotBody,
  REGISTRY_SNAPSHOT_URL,
} from './registry-snapshot-fetch';

import type { ManifestPayload } from '@pops/pillar-sdk';

function manifestPayload(pillar: string, extra: Partial<ManifestPayload> = {}): ManifestPayload {
  return {
    pillar,
    version: '1.0.0',
    contract: { package: `@pops/${pillar}`, version: '1.0.0', tag: `contract-${pillar}@v1.0.0` },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    ...extra,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const validWireEntry = {
  pillarId: 'finance',
  baseUrl: 'http://finance-api:3001',
  manifest: manifestPayload('finance'),
  lastHeartbeatAt: '2026-01-01T00:00:00.000Z',
};

describe('REGISTRY_SNAPSHOT_URL', () => {
  it('is the canonical /registry-api route', () => {
    expect(REGISTRY_SNAPSHOT_URL).toBe('/registry-api/registry/pillars');
  });
});

describe('fetchRegistrySnapshot', () => {
  it('GETs the canonical snapshot URL', async () => {
    const fetchStub = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({ pillars: [] })));
    await fetchRegistrySnapshot({ fetch: fetchStub });
    expect(fetchStub.mock.calls[0]?.[0]).toBe('/registry-api/registry/pillars');
  });

  it('parses registered entries from a well-formed snapshot', async () => {
    const fetchStub = vi.fn(() => Promise.resolve(jsonResponse({ pillars: [validWireEntry] })));
    const result = await fetchRegistrySnapshot({ fetch: fetchStub });
    expect(result).toHaveLength(1);
    expect(result[0]?.pillarId).toBe('finance');
    expect(result[0]?.registered).toBe(true);
  });

  it('soft-fails to [] on a rejected fetch', async () => {
    const fetchStub = vi.fn(() => Promise.reject(new Error('down')));
    expect(await fetchRegistrySnapshot({ fetch: fetchStub })).toEqual([]);
  });

  it('soft-fails to [] on a non-OK status', async () => {
    const fetchStub = vi.fn(() => Promise.resolve(jsonResponse({}, 502)));
    expect(await fetchRegistrySnapshot({ fetch: fetchStub })).toEqual([]);
  });

  it('soft-fails to [] on a malformed body', async () => {
    const fetchStub = vi.fn(() => Promise.resolve(jsonResponse({ not: 'pillars' })));
    expect(await fetchRegistrySnapshot({ fetch: fetchStub })).toEqual([]);
  });
});

describe('parseSnapshotBody / normaliseSnapshotEntry', () => {
  it('drops an entry with a non-string pillarId', () => {
    expect(normaliseSnapshotEntry({ ...validWireEntry, pillarId: 42 })).toBeNull();
  });

  it('drops an entry whose manifest fails schema validation', () => {
    expect(normaliseSnapshotEntry({ ...validWireEntry, manifest: { pillar: 'x' } })).toBeNull();
  });

  it('keeps well-formed entries and drops malformed ones from a mixed list', () => {
    const out = parseSnapshotBody({
      pillars: [validWireEntry, { pillarId: 7 }, { ...validWireEntry, pillarId: 'media' }],
    });
    expect(out.map((p) => p.pillarId)).toEqual(['finance', 'media']);
  });
});
