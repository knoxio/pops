/**
 * Tests for the browser-side live-registry snapshot fetch + normaliser
 * (settings-federation S3). Verifies the snapshot wire is parsed into the
 * `PillarSnapshot[]` shape `discoverSettings` consumes, that capabilities
 * round-trip, and that failures degrade to an empty list.
 */
import { describe, expect, it, vi } from 'vitest';

import { fetchSettingsSnapshot } from './settings-snapshot';

import type { ManifestPayload } from '@pops/pillar-sdk';

function manifest(pillarId: string, withSettings: boolean): ManifestPayload {
  const base: ManifestPayload = {
    pillar: pillarId,
    version: '1.0.0',
    contract: {
      package: `@pops/${pillarId}-contract`,
      version: '1.0.0',
      tag: `contract-${pillarId}@v1.0.0`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [`${pillarId}/entity`] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
  if (!withSettings) return base;
  return {
    ...base,
    settings: { manifests: [{ id: pillarId, title: pillarId, order: 0, groups: [] }] },
  };
}

function entry(
  pillarId: string,
  options: { capabilities?: Record<string, boolean>; withSettings?: boolean } = {}
) {
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3000`,
    manifest: manifest(pillarId, options.withSettings ?? true),
    contract: {
      package: `@pops/${pillarId}-contract`,
      version: '1.0.0',
      tag: `contract-${pillarId}@v1.0.0`,
    },
    registeredAt: '2026-06-22T00:00:00.000Z',
    lastHeartbeatAt: '2026-06-22T00:00:00.000Z',
    status: 'healthy',
    statusUpdatedAt: '2026-06-22T00:00:00.000Z',
    ...(options.capabilities !== undefined ? { capabilities: options.capabilities } : {}),
  };
}

function snapshotResponse(pillars: unknown[]): Response {
  return new Response(JSON.stringify({ pillars, fetchedAt: '2026-06-22T00:00:00.000Z' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchSettingsSnapshot', () => {
  it('fetches the full registry snapshot route', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => snapshotResponse([]));
    await fetchSettingsSnapshot({ fetch: fetchStub });
    expect(fetchStub.mock.calls[0]?.[0]).toBe('/core-api/registry/pillars');
  });

  it('normalises entries into PillarSnapshot shape with capabilities', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () =>
      snapshotResponse([entry('finance', { capabilities: { settings: true } })])
    );
    const result = await fetchSettingsSnapshot({ fetch: fetchStub });

    expect(result).toHaveLength(1);
    const [pillar] = result;
    expect(pillar?.pillarId).toBe('finance');
    expect(pillar?.registered).toBe(true);
    expect(pillar?.capabilities).toEqual({ settings: true });
    expect(pillar?.manifest.settings?.manifests[0]?.id).toBe('finance');
  });

  it('omits capabilities when an entry carries none', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => snapshotResponse([entry('inventory')]));
    const [pillar] = await fetchSettingsSnapshot({ fetch: fetchStub });
    expect(pillar?.capabilities).toBeUndefined();
  });

  it('drops entries with a malformed manifest rather than half-reading them', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () =>
      snapshotResponse([{ pillarId: 'broken', baseUrl: 'http://x', manifest: { nope: true } }])
    );
    expect(await fetchSettingsSnapshot({ fetch: fetchStub })).toEqual([]);
  });

  it('returns [] on a non-2xx response', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => new Response('down', { status: 503 }));
    expect(await fetchSettingsSnapshot({ fetch: fetchStub })).toEqual([]);
  });

  it('returns [] on a network throw', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => {
      throw new Error('offline');
    });
    expect(await fetchSettingsSnapshot({ fetch: fetchStub })).toEqual([]);
  });

  it('returns [] when the body is not the expected shape', async () => {
    const fetchStub = vi.fn(
      async () =>
        new Response(JSON.stringify({ unexpected: 'shape' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    expect(await fetchSettingsSnapshot({ fetch: fetchStub })).toEqual([]);
  });
});
