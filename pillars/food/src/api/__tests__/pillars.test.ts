/**
 * Smoke tests for the `GET /pillars` registry endpoint.
 *
 * Covers the synthetic-`food`-entry contract, deduplication when the
 * env already lists `food`, and a malformed POPS_PILLARS returning 500
 * (since the parser is strict by design).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb, type OpenedFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

let tmpDir: string;
let foodDb: OpenedFoodDb;
const originalPillars = process.env['POPS_PILLARS'];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-pillars-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  delete process.env['POPS_PILLARS'];
  __resetPillarRegistryCache();
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalPillars === undefined) delete process.env['POPS_PILLARS'];
  else process.env['POPS_PILLARS'] = originalPillars;
  __resetPillarRegistryCache();
});

function makeApp(): ReturnType<typeof createFoodApiApp> {
  return createFoodApiApp({
    foodDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://food-api:3005',
  });
}

describe('GET /pillars', () => {
  it('returns the synthetic food entry when POPS_PILLARS is unset', async () => {
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pillars: [{ id: 'food', baseUrl: 'http://food-api:3005' }],
    });
  });

  it('merges the synthetic food entry ahead of POPS_PILLARS-parsed siblings', async () => {
    process.env['POPS_PILLARS'] =
      'inventory:http://inventory-api:3002,finance:http://finance-api:3004';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pillars: [
        { id: 'food', baseUrl: 'http://food-api:3005' },
        { id: 'inventory', baseUrl: 'http://inventory-api:3002' },
        { id: 'finance', baseUrl: 'http://finance-api:3004' },
      ],
    });
  });

  it('overrides a POPS_PILLARS `food` entry with the live selfBaseUrl', async () => {
    process.env['POPS_PILLARS'] = 'food:http://stale-food:9000,finance:http://finance-api:3004';
    const res = await request(makeApp()).get('/pillars');
    expect(res.body).toEqual({
      pillars: [
        { id: 'food', baseUrl: 'http://food-api:3005' },
        { id: 'finance', baseUrl: 'http://finance-api:3004' },
      ],
    });
  });

  it('returns 500 on a malformed POPS_PILLARS', async () => {
    process.env['POPS_PILLARS'] = 'no-colon-here';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(500);
  });

  it('rejects a POPS_PILLARS entry with a path/query/fragment', async () => {
    process.env['POPS_PILLARS'] = 'inventory:http://inventory-api:3002/api';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(500);
  });

  it('strips a trailing slash from a clean origin', async () => {
    process.env['POPS_PILLARS'] = 'inventory:http://inventory-api:3002/';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body.pillars).toContainEqual({
      id: 'inventory',
      baseUrl: 'http://inventory-api:3002',
    });
  });
});
