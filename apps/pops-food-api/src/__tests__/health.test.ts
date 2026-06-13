/**
 * Smoke tests for the food-api Express app + health probe.
 *
 * Boots the app against a per-test temp-dir food.db (mkdtemp +
 * cleanup in afterEach) and confirms the `/health` route returns the
 * agreed `{ ok, status, pillar, version, ts }` shape.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFoodDb, type OpenedFoodDb } from '@pops/food-db';

import { createFoodApiApp } from '../app.js';

let tmpDir: string;
let foodDb: OpenedFoodDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /health', () => {
  it('returns ok + status + pillar + version + ts', async () => {
    const app = createFoodApiApp({
      foodDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3005',
    });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      status: 'ok',
      pillar: 'food',
      version: '0.0.1-test',
      ts: expect.any(String),
    });
    expect(new Date(res.body.ts as string).toISOString()).toBe(res.body.ts);
  });

  it('fails closed when the food handle is closed', async () => {
    const app = createFoodApiApp({
      foodDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3005',
    });
    foodDb.raw.close();
    const res = await request(app).get('/health');
    expect(res.status).toBe(500);
  });
});
