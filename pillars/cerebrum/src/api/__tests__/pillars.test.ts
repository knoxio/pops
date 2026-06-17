/**
 * Smoke tests for the `GET /pillars` registry endpoint.
 *
 * Covers the synthetic-`cerebrum`-entry contract, deduplication when the env
 * already lists `cerebrum`, and a malformed POPS_PILLARS returning 500 (the
 * parser is strict by design).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { makeTemplateRegistry } from './test-utils.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;
const originalPillars = process.env['POPS_PILLARS'];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-pillars-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
  delete process.env['POPS_PILLARS'];
  __resetPillarRegistryCache();
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalPillars === undefined) delete process.env['POPS_PILLARS'];
  else process.env['POPS_PILLARS'] = originalPillars;
  __resetPillarRegistryCache();
});

function makeApp(): ReturnType<typeof createCerebrumApiApp> {
  return createCerebrumApiApp({
    cerebrumDb,
    templateRegistry: makeTemplateRegistry(),
    version: '0.0.1-test',
    selfBaseUrl: 'http://cerebrum-api:3007',
  });
}

describe('GET /pillars', () => {
  it('returns the synthetic cerebrum entry when POPS_PILLARS is unset', async () => {
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pillars: [{ id: 'cerebrum', baseUrl: 'http://cerebrum-api:3007' }],
    });
  });

  it('merges the synthetic cerebrum entry ahead of POPS_PILLARS-parsed siblings', async () => {
    process.env['POPS_PILLARS'] = 'food:http://food-api:3000,finance:http://finance-api:3000';
    const res = await request(makeApp()).get('/pillars');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pillars: [
        { id: 'cerebrum', baseUrl: 'http://cerebrum-api:3007' },
        { id: 'food', baseUrl: 'http://food-api:3000' },
        { id: 'finance', baseUrl: 'http://finance-api:3000' },
      ],
    });
  });

  it('overrides a POPS_PILLARS `cerebrum` entry with the live selfBaseUrl', async () => {
    process.env['POPS_PILLARS'] = 'cerebrum:http://stale-cerebrum:9000,food:http://food-api:3000';
    const res = await request(makeApp()).get('/pillars');
    expect(res.body).toEqual({
      pillars: [
        { id: 'cerebrum', baseUrl: 'http://cerebrum-api:3007' },
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
});
