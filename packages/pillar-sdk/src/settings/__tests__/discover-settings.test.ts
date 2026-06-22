import { describe, expect, it } from 'vitest';

import { discoverSettings, findSettingsManifest } from '../discover-settings.js';

import type { CapabilityStatuses } from '../../bootstrap/transport.js';
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
  options: { registered?: boolean; capabilities?: CapabilityStatuses } = {}
): PillarSnapshot {
  const { registered = true, capabilities } = options;
  return {
    pillarId,
    baseUrl: `https://${pillarId}.test`,
    manifest: manifest(pillarId, manifests),
    registered,
    lastSeenAt: new Date('2026-01-01T00:00:00Z'),
    ...(capabilities !== undefined ? { capabilities } : {}),
  };
}

describe('discoverSettings', () => {
  it('returns an empty array when the registry has no pillars', async () => {
    const result = await discoverSettings({ discovery: [] });
    expect(result).toEqual([]);
  });

  it('returns the lone contribution tagged with its owner pillar', async () => {
    const finance = snapshot('finance', [descriptor('finance')]);
    const result = await discoverSettings({ discovery: [finance] });
    expect(result.map((c) => c.descriptor.id)).toEqual(['finance']);
    expect(result.map((c) => c.ownerPillar)).toEqual(['finance']);
  });

  it('attaches the owning pillar to every contribution it flattens', async () => {
    const cerebrum = snapshot('cerebrum', [
      descriptor('cerebrum', { order: 0 }),
      descriptor('ego', { order: 1 }),
    ]);
    const result = await discoverSettings({ discovery: [cerebrum] });
    expect(result.map((c) => c.descriptor.id)).toEqual(['cerebrum', 'ego']);
    expect(result.every((c) => c.ownerPillar === 'cerebrum')).toBe(true);
  });

  it('exposes the live capabilities map so the shell can gate the cutover', async () => {
    const finance = snapshot('finance', [descriptor('finance')], {
      capabilities: { settings: true },
    });
    const [contribution] = await discoverSettings({ discovery: [finance] });
    expect(contribution?.capabilities).toEqual({ settings: true });
  });

  it('omits capabilities when the snapshot carries none (legacy pillar)', async () => {
    const finance = snapshot('finance', [descriptor('finance')]);
    const [contribution] = await discoverSettings({ discovery: [finance] });
    expect(contribution?.capabilities).toBeUndefined();
  });

  it('orders contributions by (ownerPillar, descriptor.order, descriptor.id) across pillars', async () => {
    const media = snapshot('media', [
      descriptor('plex', { order: 2 }),
      descriptor('arr', { order: 1 }),
      descriptor('rotation', { order: 1 }),
    ]);
    const finance = snapshot('finance', [descriptor('finance', { order: 0 })]);

    const result = await discoverSettings({ discovery: [media, finance] });

    expect(result.map((c) => c.descriptor.id)).toEqual(['finance', 'arr', 'rotation', 'plex']);
    expect(result.map((c) => c.ownerPillar)).toEqual(['finance', 'media', 'media', 'media']);
  });

  it('skips pillars whose registration is not active', async () => {
    const active = snapshot('finance', [descriptor('finance')]);
    const inactive = snapshot('cerebrum', [descriptor('cerebrum')], { registered: false });

    const result = await discoverSettings({ discovery: [active, inactive] });

    expect(result.map((c) => c.descriptor.id)).toEqual(['finance']);
  });

  it('treats a missing settings block as no contribution', async () => {
    const contributor = snapshot('finance', [descriptor('finance')]);
    const silent = snapshot('inventory');

    const result = await discoverSettings({ discovery: [contributor, silent] });

    expect(result.map((c) => c.descriptor.id)).toEqual(['finance']);
  });

  it('resolves discovery from an async fetcher', async () => {
    const finance = snapshot('finance', [descriptor('finance')]);
    const result = await discoverSettings({ discovery: async () => [finance] });
    expect(result.map((c) => c.descriptor.id)).toEqual(['finance']);
  });
});

describe('findSettingsManifest', () => {
  it('returns the matching contribution when an id is present', async () => {
    const cerebrum = snapshot('cerebrum', [descriptor('cerebrum'), descriptor('ego')]);
    const contributions = await discoverSettings({ discovery: [cerebrum] });

    const ego = findSettingsManifest(contributions, 'ego');

    expect(ego?.descriptor.id).toBe('ego');
    expect(ego?.ownerPillar).toBe('cerebrum');
  });

  it('returns undefined for an unknown id', async () => {
    const finance = snapshot('finance', [descriptor('finance')]);
    const contributions = await discoverSettings({ discovery: [finance] });

    expect(findSettingsManifest(contributions, 'no-such-pillar')).toBeUndefined();
  });
});
