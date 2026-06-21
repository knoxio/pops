/**
 * Integration tests for the ai pillar's own `settings.*` RU+reset surface,
 * served from the `settings` table in `ai.db` via `@pops/pillar-settings`.
 *
 * Confirms the ai pillar OWNS serving its `ai.*` keys (per-pillar settings
 * ownership): `list` resolves manifest defaults, writes round-trip, a reset
 * restores the manifest default, and a key outside the declared `ai.*` set is
 * rejected at the contract boundary.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';

let tmpDir: string;
let aiDb: OpenedAiDb;
let app: ReturnType<typeof createAiApiApp>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-settings-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
  app = createAiApiApp({ aiDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3008' });
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('ai pillar settings RU+reset', () => {
  it('list resolves the manifest default for an unset key', async () => {
    const res = await supertest(app).get('/settings');
    expect(res.status).toBe(200);
    const rows = res.body.data as { key: string; value: string }[];
    expect(rows).toContainEqual({ key: 'ai.model', value: 'claude-haiku-4-5' });
  });

  it('get returns null for an unset key (no default at the single-key read)', async () => {
    const res = await supertest(app).get('/settings/ai.model');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });
  });

  it('round-trips a write then read', async () => {
    const put = await supertest(app)
      .put('/settings/ai.monthlyTokenBudget')
      .send({ value: '50000' });
    expect(put.status).toBe(200);

    const get = await supertest(app).get('/settings/ai.monthlyTokenBudget');
    expect(get.body.data).toEqual({ key: 'ai.monthlyTokenBudget', value: '50000' });
  });

  it('resets a key back to its manifest default', async () => {
    await supertest(app).put('/settings/ai.model').send({ value: 'claude-opus-4-7' });
    const reset = await supertest(app).post('/settings/ai.model/reset').send({});
    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({ key: 'ai.model', value: 'claude-haiku-4-5' });
  });

  it('rejects a key outside the declared ai.* set at the contract boundary', async () => {
    const res = await supertest(app).get('/settings/core.plexUrl');
    expect(res.status).toBe(400);
  });
});
