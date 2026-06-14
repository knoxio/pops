import { describe, expect, it } from 'vitest';

import { discoverSettings, findSettingsManifest } from '../discover-settings.js';

import type { PillarSnapshot } from '../../discovery/types.js';
import type { ManifestPayload, SettingsManifestDescriptor } from '../../manifest-schema/index.js';

function descriptor(
  id: string,
  overrides: Partial<SettingsManifestDescriptor> = {}
): SettingsManifestDescriptor {
  return {
    id,
    title: `${id} settings`,
    order: 0,
    groups: [],
    ...overrides,
  };
}

function manifest(
  pillarId: string,
  manifests?: readonly SettingsManifestDescriptor[]
): ManifestPayload {
  const base: ManifestPayload = {
    pillar: pillarId,
    version: '1.0.0',
    contract: {
      package: `@pops/${pillarId}-contract`,
      version: '1.0.0',
      tag: `contract-${pillarId}@v1.0.0`,
    },
    routes: {
      queries: [],
      mutations: [],
      subscriptions: [],
    },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [`${pillarId}/entity`] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
  if (manifests === undefined) return base;
  return { ...base, settings: { manifests: [...manifests] } };
}

function snapshot(
  pillarId: string,
  manifests?: readonly SettingsManifestDescriptor[],
  registered = true
): PillarSnapshot {
  return {
    pillarId,
    baseUrl: `https://${pillarId}.test`,
    manifest: manifest(pillarId, manifests),
    registered,
    lastSeenAt: new Date('2026-01-01T00:00:00Z'),
  };
}

describe('discoverSettings', () => {
  it('returns an empty array when the registry has no pillars', async () => {
    const result = await discoverSettings({ discovery: [] });
    expect(result).toEqual([]);
  });

  it('returns the lone contribution when a single pillar contributes one manifest', async () => {
    const finance = snapshot('finance', [descriptor('finance')]);
    const result = await discoverSettings({ discovery: [finance] });
    expect(result.map((m) => m.id)).toEqual(['finance']);
  });

  it('flattens contributions from a pillar declaring multiple manifests', async () => {
    const cerebrum = snapshot('cerebrum', [
      descriptor('cerebrum', { order: 0 }),
      descriptor('ego', { order: 1 }),
    ]);
    const result = await discoverSettings({ discovery: [cerebrum] });
    expect(result.map((m) => m.id)).toEqual(['cerebrum', 'ego']);
  });

  it('orders contributions by (pillarId, manifest.order, manifest.id) across pillars', async () => {
    const media = snapshot('media', [
      descriptor('plex', { order: 2 }),
      descriptor('arr', { order: 1 }),
      descriptor('rotation', { order: 1 }),
    ]);
    const finance = snapshot('finance', [descriptor('finance', { order: 0 })]);

    const result = await discoverSettings({ discovery: [media, finance] });

    expect(result.map((m) => m.id)).toEqual(['finance', 'arr', 'rotation', 'plex']);
  });

  it('skips pillars whose registration is not active', async () => {
    const active = snapshot('finance', [descriptor('finance')]);
    const inactive = snapshot('cerebrum', [descriptor('cerebrum')], false);

    const result = await discoverSettings({ discovery: [active, inactive] });

    expect(result.map((m) => m.id)).toEqual(['finance']);
  });

  it('treats a missing settings block as no contribution', async () => {
    const contributor = snapshot('finance', [descriptor('finance')]);
    const silent = snapshot('inventory');

    const result = await discoverSettings({ discovery: [contributor, silent] });

    expect(result.map((m) => m.id)).toEqual(['finance']);
  });

  it('resolves discovery from an async fetcher', async () => {
    const finance = snapshot('finance', [descriptor('finance')]);
    const result = await discoverSettings({ discovery: async () => [finance] });
    expect(result.map((m) => m.id)).toEqual(['finance']);
  });
});

describe('findSettingsManifest', () => {
  it('returns the matching manifest when an id is present', async () => {
    const cerebrum = snapshot('cerebrum', [descriptor('cerebrum'), descriptor('ego')]);
    const manifests = await discoverSettings({ discovery: [cerebrum] });

    const ego = findSettingsManifest(manifests, 'ego');

    expect(ego?.id).toBe('ego');
  });

  it('returns undefined for an unknown id', async () => {
    const finance = snapshot('finance', [descriptor('finance')]);
    const manifests = await discoverSettings({ discovery: [finance] });

    expect(findSettingsManifest(manifests, 'no-such-pillar')).toBeUndefined();
  });
});
