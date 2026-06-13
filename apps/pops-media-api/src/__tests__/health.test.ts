/**
 * Smoke tests for the media-api Express app + health probe.
 *
 * Boots the app against a per-test temp-dir media.db (mkdtemp + cleanup
 * in afterEach) and confirms the `/health` route returns the agreed
 * `{ ok, status, pillar, version, ts }` shape.
 *
 * Mirrors `apps/pops-core-api/src/__tests__/health.test.ts`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '@pops/media-db';

import { createMediaApiApp } from '../app.js';

let tmpDir: string;
let mediaDb: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /health', () => {
  it('returns ok + status + pillar + version + ts', async () => {
    const app = createMediaApiApp({ mediaDb, version: '0.0.1-test' });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      status: 'ok',
      pillar: 'media',
      version: '0.0.1-test',
      ts: expect.any(String),
    });
    expect(new Date(res.body.ts as string).toISOString()).toBe(res.body.ts);
  });

  it('fails closed when the media handle is closed', async () => {
    const app = createMediaApiApp({ mediaDb, version: '0.0.1-test' });
    mediaDb.raw.close();
    const res = await request(app).get('/health');
    expect(res.status).toBe(500);
  });
});
