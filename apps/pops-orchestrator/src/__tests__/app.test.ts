import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createOrchestratorApp } from '../app.js';
import { __resetPillarRegistryCache, type RegistrySnapshotReader } from '../pillars/registry.js';

import type { PillarSnapshot } from '@pops/pillar-sdk/discovery';
import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

const SELF_BASE_URL = 'http://localhost:3009';

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

/** Snapshot reader that yields the given live entries. */
function reader(...entries: PillarSnapshot[]): RegistrySnapshotReader {
  return async () => entries;
}

/** Snapshot reader that yields an empty registry (cold-start / seed-only). */
const emptyReader: RegistrySnapshotReader = async () => [];

function makeApp(snapshotReader: RegistrySnapshotReader) {
  return createOrchestratorApp({ version: '1.2.3', selfBaseUrl: SELF_BASE_URL, snapshotReader });
}

describe('orchestrator app', () => {
  const originalPillars = process.env['POPS_PILLARS'];

  beforeEach(() => {
    __resetPillarRegistryCache();
    delete process.env['POPS_PILLARS'];
  });

  afterEach(() => {
    __resetPillarRegistryCache();
    if (originalPillars === undefined) {
      delete process.env['POPS_PILLARS'];
    } else {
      process.env['POPS_PILLARS'] = originalPillars;
    }
  });

  describe('GET /health', () => {
    it('returns ok with the orchestrator service identity and build version', async () => {
      const res = await request(makeApp(emptyReader)).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        status: 'ok',
        service: 'orchestrator',
        version: '1.2.3',
      });
      expect(typeof res.body.ts).toBe('string');
      expect(Number.isNaN(Date.parse(res.body.ts))).toBe(false);
    });
  });

  describe('GET /pillars — seed fallback (empty registry)', () => {
    it('lists the synthetic orchestrator self-entry first when POPS_PILLARS is unset', async () => {
      const res = await request(makeApp(emptyReader)).get('/pillars');

      expect(res.status).toBe(200);
      expect(res.body.pillars).toEqual([{ id: 'orchestrator', baseUrl: SELF_BASE_URL }]);
    });

    it('federates the parsed POPS_PILLARS seed behind the self-entry', async () => {
      process.env['POPS_PILLARS'] = 'finance:http://finance-api:3004,food:http://food-api:3005';
      __resetPillarRegistryCache();

      const res = await request(makeApp(emptyReader)).get('/pillars');

      expect(res.status).toBe(200);
      expect(res.body.pillars).toEqual([
        { id: 'orchestrator', baseUrl: SELF_BASE_URL },
        { id: 'finance', baseUrl: 'http://finance-api:3004' },
        { id: 'food', baseUrl: 'http://food-api:3005' },
      ]);
    });

    it('drops a stale orchestrator seed entry in favour of the live self-entry', async () => {
      process.env['POPS_PILLARS'] =
        'orchestrator:http://stale:9999,finance:http://finance-api:3004';
      __resetPillarRegistryCache();

      const res = await request(makeApp(emptyReader)).get('/pillars');

      expect(res.status).toBe(200);
      expect(res.body.pillars).toEqual([
        { id: 'orchestrator', baseUrl: SELF_BASE_URL },
        { id: 'finance', baseUrl: 'http://finance-api:3004' },
      ]);
    });
  });

  describe('GET /pillars — registry-as-truth', () => {
    it('surfaces a registry-registered pillar even when POPS_PILLARS is unset', async () => {
      const res = await request(
        makeApp(reader(snapshotEntry('media', 'http://media-api:3005')))
      ).get('/pillars');

      expect(res.status).toBe(200);
      expect(res.body.pillars).toEqual([
        { id: 'orchestrator', baseUrl: SELF_BASE_URL },
        { id: 'media', baseUrl: 'http://media-api:3005' },
      ]);
    });

    it('backfills a seeded id the registry has no live entry for, registry first', async () => {
      process.env['POPS_PILLARS'] = 'finance:http://finance-api:3004';
      __resetPillarRegistryCache();

      const res = await request(
        makeApp(reader(snapshotEntry('media', 'http://media-api:3005')))
      ).get('/pillars');

      expect(res.status).toBe(200);
      expect(res.body.pillars).toEqual([
        { id: 'orchestrator', baseUrl: SELF_BASE_URL },
        { id: 'media', baseUrl: 'http://media-api:3005' },
        { id: 'finance', baseUrl: 'http://finance-api:3004' },
      ]);
    });

    it('lets a live registration win over a stale seed entry for the same id', async () => {
      process.env['POPS_PILLARS'] = 'media:http://stale-media:9999';
      __resetPillarRegistryCache();

      const res = await request(
        makeApp(reader(snapshotEntry('media', 'http://media-api:3005')))
      ).get('/pillars');

      expect(res.status).toBe(200);
      const mediaEntries = res.body.pillars.filter((p: { id: string }) => p.id === 'media');
      expect(mediaEntries).toEqual([{ id: 'media', baseUrl: 'http://media-api:3005' }]);
    });
  });
});
