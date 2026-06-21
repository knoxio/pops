/**
 * Tests for the `GET /pillars` registry endpoint.
 *
 * `GET /pillars` is registry-as-truth: the live DB-backed `pillar_registry`
 * table is the primary source, `POPS_PILLARS` is a boot seed / fallback. The
 * suite covers:
 *   - the synthetic-`core`-entry contract and the seed-only path (empty
 *     registry ⇒ behaves exactly like the old static env view);
 *   - a registered pillar surfacing in `/pillars` from the DB;
 *   - the seed backfilling a known id the registry has no live entry for;
 *   - a live registration WINNING over a stale seed entry for the same id;
 *   - a malformed POPS_PILLARS seed still returning 500 (strict parser).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, pillarRegistryService, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { ManifestPayload } from '@pops/pillar-sdk';

let tmpDir: string;
let coreDb: OpenedCoreDb;
const originalPillars = process.env['POPS_PILLARS'];

/** Minimal-but-schema-valid manifest for a registered pillar. */
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

/** Register a pillar in the live DB registry. */
function register(pillarId: string, baseUrl: string): void {
  pillarRegistryService.upsertPillarRegistration(coreDb.db, {
    baseUrl,
    manifest: manifestFor(pillarId),
  });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-pillars-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  delete process.env['POPS_PILLARS'];
  __resetPillarRegistryCache();
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalPillars === undefined) delete process.env['POPS_PILLARS'];
  else process.env['POPS_PILLARS'] = originalPillars;
  __resetPillarRegistryCache();
});

function makeApp(): ReturnType<typeof createCoreApiApp> {
  return createCoreApiApp({
    coreDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://core-api:3001',
  });
}

describe('GET /pillars — seed-only fallback (empty registry)', () => {
  it('returns the synthetic core entry when POPS_PILLARS is unset', async () => {
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pillars: [{ id: 'core', baseUrl: 'http://core-api:3001' }],
    });
  });

  it('merges the synthetic core entry ahead of POPS_PILLARS-parsed siblings', async () => {
    process.env['POPS_PILLARS'] = 'food:http://food-api:3000,finance:http://finance-api:3000';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pillars: [
        { id: 'core', baseUrl: 'http://core-api:3001' },
        { id: 'food', baseUrl: 'http://food-api:3000' },
        { id: 'finance', baseUrl: 'http://finance-api:3000' },
      ],
    });
  });

  it('overrides a POPS_PILLARS `core` entry with the live selfBaseUrl', async () => {
    process.env['POPS_PILLARS'] = 'core:http://stale-core:9000,food:http://food-api:3000';
    const res = await request(makeApp()).get('/pillars');
    expect(res.body).toEqual({
      pillars: [
        { id: 'core', baseUrl: 'http://core-api:3001' },
        { id: 'food', baseUrl: 'http://food-api:3000' },
      ],
    });
  });

  it('returns 500 on a malformed POPS_PILLARS seed', async () => {
    process.env['POPS_PILLARS'] = 'no-colon-here';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(500);
  });

  it('rejects a POPS_PILLARS seed entry with a path/query/fragment', async () => {
    process.env['POPS_PILLARS'] = 'food:http://food-api:3000/api';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(500);
  });

  it('strips a trailing slash from a clean seed origin', async () => {
    process.env['POPS_PILLARS'] = 'food:http://food-api:3000/';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body.pillars).toContainEqual({
      id: 'food',
      baseUrl: 'http://food-api:3000',
    });
  });
});

describe('GET /pillars — registry-as-truth', () => {
  it('surfaces a DB-registered pillar even when POPS_PILLARS is unset', async () => {
    register('media', 'http://media-api:3005');
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body.pillars).toContainEqual({ id: 'core', baseUrl: 'http://core-api:3001' });
    expect(res.body.pillars).toContainEqual({ id: 'media', baseUrl: 'http://media-api:3005' });
  });

  it('falls back to a seeded id the registry has no live entry for', async () => {
    process.env['POPS_PILLARS'] = 'finance:http://finance-api:3004';
    register('media', 'http://media-api:3005');
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    // media comes from the live registry; finance is seed-only fallback.
    expect(res.body.pillars).toContainEqual({ id: 'media', baseUrl: 'http://media-api:3005' });
    expect(res.body.pillars).toContainEqual({ id: 'finance', baseUrl: 'http://finance-api:3004' });
  });

  it('lets a live registration win over a stale seed entry for the same id', async () => {
    process.env['POPS_PILLARS'] = 'media:http://stale-media:9999';
    register('media', 'http://media-api:3005');
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    const mediaEntries = res.body.pillars.filter((p: { id: string }) => p.id === 'media');
    expect(mediaEntries).toEqual([{ id: 'media', baseUrl: 'http://media-api:3005' }]);
  });

  it('orders live registry entries ahead of seed-only fallback entries', async () => {
    process.env['POPS_PILLARS'] = 'finance:http://finance-api:3004';
    register('media', 'http://media-api:3005');
    const res = await request(makeApp()).get('/pillars');
    expect(res.body.pillars).toEqual([
      { id: 'core', baseUrl: 'http://core-api:3001' },
      { id: 'media', baseUrl: 'http://media-api:3005' },
      { id: 'finance', baseUrl: 'http://finance-api:3004' },
    ]);
  });

  it('never proxies the synthetic core self-entry to a DB-registered core row', async () => {
    register('core', 'http://stale-core-row:9000');
    const res = await request(makeApp()).get('/pillars');
    const coreEntries = res.body.pillars.filter((p: { id: string }) => p.id === 'core');
    expect(coreEntries).toEqual([{ id: 'core', baseUrl: 'http://core-api:3001' }]);
  });
});
