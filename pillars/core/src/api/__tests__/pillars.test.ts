/**
 * Smoke tests for the `GET /pillars` registry endpoint.
 *
 * Covers the synthetic-`core`-entry contract, deduplication when the
 * env already lists `core`, and a malformed POPS_PILLARS returning 500
 * (since the parser is strict by design).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;
const originalPillars = process.env['POPS_PILLARS'];

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

describe('GET /pillars', () => {
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

  it('returns 500 on a malformed POPS_PILLARS', async () => {
    process.env['POPS_PILLARS'] = 'no-colon-here';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(500);
  });

  it('rejects a POPS_PILLARS entry with a path/query/fragment', async () => {
    process.env['POPS_PILLARS'] = 'food:http://food-api:3000/api';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(500);
  });

  it('strips a trailing slash from a clean origin', async () => {
    process.env['POPS_PILLARS'] = 'food:http://food-api:3000/';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body.pillars).toContainEqual({
      id: 'food',
      baseUrl: 'http://food-api:3000',
    });
  });
});
