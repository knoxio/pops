/**
 * Smoke tests for the finance-api Express app + health probe.
 *
 * Boots the app against a per-test temp-dir finance.db (mkdtemp +
 * cleanup in afterEach) and confirms the `/health` route returns the
 * agreed `{ ok, status, pillar, version, ts }` shape.
 *
 * Mirrors `apps/pops-media-api/src/__tests__/health.test.ts`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '@pops/finance-db';

import { createFinanceApiApp } from '../app.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /health', () => {
  it('returns ok + status + pillar + version + ts', async () => {
    const app = createFinanceApiApp({ financeDb, version: '0.0.1-test' });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      status: 'ok',
      pillar: 'finance',
      version: '0.0.1-test',
      ts: expect.any(String),
    });
    expect(new Date(res.body.ts as string).toISOString()).toBe(res.body.ts);
  });

  it('fails closed when the finance handle is closed', async () => {
    const app = createFinanceApiApp({ financeDb, version: '0.0.1-test' });
    financeDb.raw.close();
    const res = await request(app).get('/health');
    expect(res.status).toBe(500);
  });
});
