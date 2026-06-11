/**
 * Smoke tests for the lists-api Express app + health probe.
 *
 * Boots the app against a per-test temp-dir lists.db (mkdtemp +
 * cleanup in afterEach) and confirms the `/health` route returns the
 * agreed `{ ok, pillar, version }` shape.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openListsDb, type OpenedListsDb } from '@pops/lists-db';

import { createListsApiApp } from '../app.js';

let tmpDir: string;
let listsDb: OpenedListsDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lists-api-test-'));
  listsDb = openListsDb(join(tmpDir, 'lists.db'));
});

afterEach(() => {
  listsDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /health', () => {
  it('returns ok + pillar + version', async () => {
    const app = createListsApiApp({
      listsDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3006',
    });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, pillar: 'lists', version: '0.0.1-test' });
  });

  it('fails closed when the lists handle is closed', async () => {
    const app = createListsApiApp({
      listsDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3006',
    });
    listsDb.raw.close();
    const res = await request(app).get('/health');
    expect(res.status).toBe(500);
  });
});
