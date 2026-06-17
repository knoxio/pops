/**
 * Smoke tests for the cerebrum-api Express app + health probe.
 *
 * Boots the app against a per-test temp-dir cerebrum.db (mkdtemp + cleanup in
 * afterEach) and confirms the `/health` route returns the agreed
 * `{ ok, status, pillar, version, ts }` shape.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { makeTemplateRegistry } from './test-utils.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeApp(): ReturnType<typeof createCerebrumApiApp> {
  return createCerebrumApiApp({
    cerebrumDb,
    templateRegistry: makeTemplateRegistry(),
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3007',
  });
}

describe('GET /health', () => {
  it('returns ok + status + pillar + version + ts', async () => {
    const res = await request(makeApp()).get('/health');
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
    const app = makeApp();
    cerebrumDb.raw.close();
    const res = await request(app).get('/health');
    expect(res.status).toBe(500);
  });
});
