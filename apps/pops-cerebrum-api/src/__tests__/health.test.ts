/**
 * Smoke tests for the cerebrum-api Express app + health probe.
 *
 * Boots the app against a per-test temp-dir cerebrum.db (mkdtemp +
 * cleanup in afterEach) and confirms the `/health` route returns the
 * agreed `{ ok, status, pillar, version, ts }` shape.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '@pops/cerebrum-db';
import { openCoreDb, type OpenedCoreDb } from '@pops/core-db';

import { createCerebrumApiApp } from '../app.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /health', () => {
  it('returns ok + status + pillar + version + ts', async () => {
    const app = createCerebrumApiApp({ cerebrumDb, coreDb, version: '0.0.1-test' });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      status: 'ok',
      pillar: 'cerebrum',
      version: '0.0.1-test',
      ts: expect.any(String),
    });
    expect(new Date(res.body.ts as string).toISOString()).toBe(res.body.ts);
  });

  it('fails closed when the cerebrum handle is closed', async () => {
    const app = createCerebrumApiApp({ cerebrumDb, coreDb, version: '0.0.1-test' });
    cerebrumDb.raw.close();
    const res = await request(app).get('/health');
    expect(res.status).toBe(500);
  });
});
