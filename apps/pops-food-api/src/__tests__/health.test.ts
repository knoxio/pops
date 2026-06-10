/**
 * Smoke tests for the food-api Express app + health probe.
 *
 * Boots the app against a per-test temp-dir food.db (mkdtemp +
 * cleanup in afterEach) and confirms the `/health` route returns the
 * agreed `{ ok, pillar, version }` shape.
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
  it('returns ok + pillar + version', async () => {
    const app = createFoodApiApp({
      foodDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3005',
    });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, pillar: 'food', version: '0.0.1-test' });
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
