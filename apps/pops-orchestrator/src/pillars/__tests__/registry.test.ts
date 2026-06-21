import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RegistryUnreachableError, type PillarSnapshot } from '@pops/pillar-sdk/discovery';

import {
  __resetPillarRegistryCache,
  getPillarRegistry,
  resolvePillarRegistry,
  type RegistrySnapshotReader,
} from '../registry.js';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

const SELF = 'http://localhost:3009';

function manifestFor(pillarId: string): ManifestPayload {
  return {
    pillar: pillarId,
    version: '0.1.0',
    contract: {
      package: `@pops/${pillarId}-contract`,
      version: '0.1.0',
      tag: `contract-${pillarId}@v0.1.0`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
  };
}

function snapshotEntry(pillarId: string, baseUrl: string): PillarSnapshot {
  return {
    pillarId,
    baseUrl,
    manifest: manifestFor(pillarId),
    registered: true,
    lastSeenAt: new Date(),
    status: 'healthy',
  };
}

const originalPillars = process.env['POPS_PILLARS'];

beforeEach(() => {
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
});

afterEach(() => {
  __resetPillarRegistryCache();
  if (originalPillars === undefined) delete process.env['POPS_PILLARS'];
  else process.env['POPS_PILLARS'] = originalPillars;
});

describe('resolvePillarRegistry — registry-first', () => {
  it('projects live snapshot entries behind the synthetic self entry', async () => {
    const reader: RegistrySnapshotReader = async () => [
      snapshotEntry('media', 'http://media-api:3005'),
    ];
    const entries = await resolvePillarRegistry({ selfBaseUrl: SELF }, reader);
    expect(entries).toEqual([
      { id: 'orchestrator', baseUrl: SELF },
      { id: 'media', baseUrl: 'http://media-api:3005' },
    ]);
  });

  it('lets a live registration win over a stale seed for the same id', async () => {
    process.env['POPS_PILLARS'] = 'media:http://stale-media:9999';
    __resetPillarRegistryCache();
    const reader: RegistrySnapshotReader = async () => [
      snapshotEntry('media', 'http://media-api:3005'),
    ];
    const entries = await resolvePillarRegistry({ selfBaseUrl: SELF }, reader);
    expect(entries.filter((e) => e.id === 'media')).toEqual([
      { id: 'media', baseUrl: 'http://media-api:3005' },
    ]);
  });

  it('backfills seed-only ids the registry has no entry for, registry first', async () => {
    process.env['POPS_PILLARS'] = 'finance:http://finance-api:3004';
    __resetPillarRegistryCache();
    const reader: RegistrySnapshotReader = async () => [
      snapshotEntry('media', 'http://media-api:3005'),
    ];
    const entries = await resolvePillarRegistry({ selfBaseUrl: SELF }, reader);
    expect(entries).toEqual([
      { id: 'orchestrator', baseUrl: SELF },
      { id: 'media', baseUrl: 'http://media-api:3005' },
      { id: 'finance', baseUrl: 'http://finance-api:3004' },
    ]);
  });

  it('drops a snapshot self-entry — the live self entry always leads', async () => {
    const reader: RegistrySnapshotReader = async () => [
      snapshotEntry('orchestrator', 'http://stale-orch:1234'),
      snapshotEntry('media', 'http://media-api:3005'),
    ];
    const entries = await resolvePillarRegistry({ selfBaseUrl: SELF }, reader);
    expect(entries.filter((e) => e.id === 'orchestrator')).toEqual([
      { id: 'orchestrator', baseUrl: SELF },
    ]);
  });
});

describe('resolvePillarRegistry — registry unreachable', () => {
  it('falls back to the env-only seed view when the registry is unreachable', async () => {
    process.env['POPS_PILLARS'] = 'finance:http://finance-api:3004';
    __resetPillarRegistryCache();
    const reader: RegistrySnapshotReader = async () => {
      throw new RegistryUnreachableError('down', { attempts: 1 });
    };
    const entries = await resolvePillarRegistry({ selfBaseUrl: SELF }, reader);
    expect(entries).toEqual(getPillarRegistry({ selfBaseUrl: SELF }));
    expect(entries).toEqual([
      { id: 'orchestrator', baseUrl: SELF },
      { id: 'finance', baseUrl: 'http://finance-api:3004' },
    ]);
  });

  it('rethrows non-RegistryUnreachable errors', async () => {
    const reader: RegistrySnapshotReader = async () => {
      throw new Error('schema validation boom');
    };
    await expect(resolvePillarRegistry({ selfBaseUrl: SELF }, reader)).rejects.toThrow(
      'schema validation boom'
    );
  });
});
