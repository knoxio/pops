/**
 * Integration tests for the Express dispatcher surface mounted before
 * `/trpc` in `app.ts` (ADR-026 P2/P3):
 *
 *   - POST /uri/resolve   — cross-pillar URI dispatcher
 *   - GET  /pillars/health — aggregated cross-pillar health fan-out
 *
 * The core pillar container declares no in-process `uriHandler`, so every
 * locally-owned URI returns `not-found` (well-formed, no handler) and an
 * un-owned module returns `module-absent`. The remote leg + health fan-out
 * are exercised by pointing `POPS_PILLARS` at a stubbed `fetch`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { __resetInstalledModulesCache } from '../env-modules.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;
const originalPillars = process.env['POPS_PILLARS'];
const originalApps = process.env['POPS_APPS'];
const originalOverlays = process.env['POPS_OVERLAYS'];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-uri-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  delete process.env['POPS_PILLARS'];
  delete process.env['POPS_APPS'];
  delete process.env['POPS_OVERLAYS'];
  __resetPillarRegistryCache();
  __resetInstalledModulesCache();
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalPillars === undefined) delete process.env['POPS_PILLARS'];
  else process.env['POPS_PILLARS'] = originalPillars;
  if (originalApps === undefined) delete process.env['POPS_APPS'];
  else process.env['POPS_APPS'] = originalApps;
  if (originalOverlays === undefined) delete process.env['POPS_OVERLAYS'];
  else process.env['POPS_OVERLAYS'] = originalOverlays;
  __resetPillarRegistryCache();
  __resetInstalledModulesCache();
});

function makeApp(): ReturnType<typeof createCoreApiApp> {
  return createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://core-api:3001' });
}

describe('POST /uri/resolve', () => {
  it('returns 400 + malformed for a missing uri field', async () => {
    const res = await request(makeApp()).post('/uri/resolve').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      kind: 'malformed',
      uri: '',
      reason: 'request body must be { uri: string }',
    });
  });

  it('returns malformed for a non-pops URI', async () => {
    const res = await request(makeApp()).post('/uri/resolve').send({ uri: 'http://example.com' });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('malformed');
    expect(res.body.uri).toBe('http://example.com');
  });

  it('returns module-absent when the owning module is not installed', async () => {
    process.env['POPS_APPS'] = 'finance';
    process.env['POPS_OVERLAYS'] = '';
    __resetInstalledModulesCache();

    const res = await request(makeApp()).post('/uri/resolve').send({ uri: 'pops:media/movie/42' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'module-absent', moduleId: 'media' });
  });

  it('returns not-found for an installed module with no in-process uri handler', async () => {
    const res = await request(makeApp())
      .post('/uri/resolve')
      .send({ uri: 'pops:finance/transaction/tx-1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      kind: 'not-found',
      moduleId: 'finance',
      type: 'transaction',
      id: 'tx-1',
    });
  });

  it('proxies to a registered remote pillar via the default fetch leg', async () => {
    process.env['POPS_PILLARS'] = 'food:http://food-api:3000';
    __resetPillarRegistryCache();
    const remoteBody = {
      kind: 'object',
      moduleId: 'food',
      type: 'recipe',
      id: 'rec-1',
      data: { title: 'Soup' },
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(remoteBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    try {
      const res = await request(makeApp())
        .post('/uri/resolve')
        .send({ uri: 'pops:food/recipe/rec-1' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(remoteBody);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://food-api:3000/uri/resolve',
        expect.objectContaining({ method: 'POST' })
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('GET /pillars/health', () => {
  it('reports the self-pillar as healthy without HTTP when POPS_PILLARS is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const res = await request(makeApp()).get('/pillars/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ health: { core: 'healthy' } });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fans out to remote pillars and aggregates their health', async () => {
    process.env['POPS_PILLARS'] = 'food:http://food-api:3000';
    __resetPillarRegistryCache();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, pillar: 'food', version: 'dev' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    try {
      const res = await request(makeApp()).get('/pillars/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ health: { core: 'healthy', food: 'healthy' } });
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://food-api:3000/health',
        expect.objectContaining({ method: 'GET' })
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('reports an unreachable remote pillar as unavailable', async () => {
    process.env['POPS_PILLARS'] = 'food:http://food-api:3000';
    __resetPillarRegistryCache();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('boom'));
    try {
      const res = await request(makeApp()).get('/pillars/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ health: { core: 'healthy', food: 'unavailable' } });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
