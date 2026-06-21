/**
 * Integration tests for the cross-pillar ingest `POST /ai-usage/record` — the
 * FIRST production write path into `ai_inference_log`. Driven through the real
 * Express app via supertest against a temp SQLite (the ai pillar's own
 * baseline migration).
 *
 * Covers the GATE-P1 acceptance: internal-token gate (403 without the token),
 * a valid record writes exactly one `ai_inference_log` row with the field
 * mapping applied (cached 0|1, promptVersion→metadata.prompt_version,
 * contextId→context_id), an invalid/malformed domain 400s, the handler is
 * best-effort (oversized metadata is dropped, never throws), and — critically —
 * the ingest NEVER touches `ai_inference_daily`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';

const TOKEN = 'test-internal-token';

let tmpDir: string;
let aiDb: OpenedAiDb;
let app: ReturnType<typeof createAiApiApp>;

function countLogs(): number {
  const row = aiDb.db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ai_inference_log`);
  return row?.n ?? -1;
}

function countDaily(): number {
  const row = aiDb.db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ai_inference_daily`);
  return row?.n ?? -1;
}

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'claude',
    model: 'claude-haiku-4-5',
    operation: 'imports.categorize',
    domain: 'finance',
    inputTokens: 120,
    outputTokens: 30,
    costUsd: 0.0012,
    latencyMs: 540,
    status: 'success',
    cached: false,
    ...overrides,
  };
}

beforeEach(() => {
  process.env['POPS_API_INTERNAL_TOKEN'] = TOKEN;
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-ingest-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
  app = createAiApiApp({ aiDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3008' });
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['POPS_API_INTERNAL_TOKEN'];
});

describe('POST /ai-usage/record — internal-token gate', () => {
  it('403s without the internal token', async () => {
    const res = await supertest(app).post('/ai-usage/record').send(validRecord());
    expect(res.status).toBe(403);
    expect(countLogs()).toBe(0);
  });

  it('403s with a wrong internal token', async () => {
    const res = await supertest(app)
      .post('/ai-usage/record')
      .set('x-pops-internal-token', 'nope')
      .send(validRecord());
    expect(res.status).toBe(403);
    expect(countLogs()).toBe(0);
  });
});

describe('POST /ai-usage/record — happy path', () => {
  it('writes exactly one ai_inference_log row and never touches ai_inference_daily', async () => {
    const res = await supertest(app)
      .post('/ai-usage/record')
      .set('x-pops-internal-token', TOKEN)
      .send(validRecord());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(countLogs()).toBe(1);
    expect(countDaily()).toBe(0);
  });

  it('maps cached→0|1, promptVersion→metadata.prompt_version, contextId→context_id', async () => {
    await supertest(app)
      .post('/ai-usage/record')
      .set('x-pops-internal-token', TOKEN)
      .send(
        validRecord({
          cached: true,
          contextId: 'import_batch:42',
          promptVersion: 'v3',
          metadata: { kind: 'screenshot' },
        })
      );

    const row = aiDb.db.get<{
      cached: number;
      context_id: string | null;
      metadata: string | null;
    }>(sql`SELECT cached, context_id, metadata FROM ai_inference_log LIMIT 1`);

    expect(row?.cached).toBe(1);
    expect(row?.context_id).toBe('import_batch:42');
    const meta = JSON.parse(row?.metadata ?? '{}') as Record<string, unknown>;
    expect(meta['prompt_version']).toBe('v3');
    expect(meta['kind']).toBe('screenshot');
  });

  it('persists null metadata when none is supplied', async () => {
    await supertest(app)
      .post('/ai-usage/record')
      .set('x-pops-internal-token', TOKEN)
      .send(validRecord());

    const row = aiDb.db.get<{ metadata: string | null }>(
      sql`SELECT metadata FROM ai_inference_log LIMIT 1`
    );
    expect(row?.metadata).toBeNull();
  });
});

describe('POST /ai-usage/record — validation + best-effort', () => {
  it('400s a malformed domain without writing a row', async () => {
    const res = await supertest(app)
      .post('/ai-usage/record')
      .set('x-pops-internal-token', TOKEN)
      .send(validRecord({ domain: 'Finance Pillar!!' }));

    expect(res.status).toBe(400);
    expect(countLogs()).toBe(0);
  });

  it('400s a body that fails the zod schema (negative tokens)', async () => {
    const res = await supertest(app)
      .post('/ai-usage/record')
      .set('x-pops-internal-token', TOKEN)
      .send(validRecord({ inputTokens: -5 }));

    expect(res.status).toBe(400);
    expect(countLogs()).toBe(0);
  });

  it('drops oversized metadata (caps the JSON) but still writes the row 200', async () => {
    const huge = 'x'.repeat(8000);
    const res = await supertest(app)
      .post('/ai-usage/record')
      .set('x-pops-internal-token', TOKEN)
      .send(validRecord({ metadata: { blob: huge } }));

    expect(res.status).toBe(200);
    expect(countLogs()).toBe(1);
    const row = aiDb.db.get<{ metadata: string | null }>(
      sql`SELECT metadata FROM ai_inference_log LIMIT 1`
    );
    expect(row?.metadata).toBeNull();
  });
});
