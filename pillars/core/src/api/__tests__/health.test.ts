/**
 * Smoke tests for the core-api Express app + health probe.
 *
 * Boots the app against a per-test temp-dir core.db (mkdtemp + cleanup
 * in afterEach) and confirms the `/health` route returns the agreed
 * `{ ok, status, pillar, version, ts }` shape.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /health', () => {
  it('returns ok + status + pillar + version + ts', async () => {
    const app = createCoreApiApp({
      coreDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3001',
    });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      status: 'ok',
      pillar: 'core',
      version: '0.0.1-test',
      ts: expect.any(String),
    });
    expect(() => new Date(res.body.ts as string).toISOString()).not.toThrow();
    expect(new Date(res.body.ts as string).toISOString()).toBe(res.body.ts);
  });

  it('fails closed when the core handle is closed', async () => {
    const app = createCoreApiApp({
      coreDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3001',
    });
    coreDb.raw.close();
    const res = await request(app).get('/health');
    expect(res.status).toBe(500);
  });
});
