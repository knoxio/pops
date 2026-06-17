/**
 * Integration tests for `ai.logInference` (PRD-133). Internal-only (gated on
 * x-pops-internal-token); writes one best-effort row to the pillar's
 * ai_inference_log with domain='food' and server-authored prompt_version.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiInferenceLog, type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

const TOKEN = 'test-internal-token';

const SAMPLE = {
  operation: 'recipe-extract-web-llm' as const,
  contextId: 'ingest_source:7',
  provider: 'claude' as const,
  model: 'claude-haiku-4-5-20251001',
  promptVersion: 'web-llm-v1.0',
  inputTokens: 1200,
  outputTokens: 400,
  costUsd: 0.0008,
  latencyMs: 42,
  status: 'success' as const,
  cached: false,
};

let tmpDir: string;
let foodDb: OpenedFoodDb;

function client(): ReturnType<typeof makeClient> {
  return makeClient(
    createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' })
  );
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-ai-test-'));
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
  process.env['POPS_API_INTERNAL_TOKEN'] = TOKEN;
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['POPS_API_INTERNAL_TOKEN'];
});

describe('ai.logInference REST', () => {
  it('writes a food row with merged prompt_version when authorised', async () => {
    const res = await client().ai.logInference(
      { ...SAMPLE, metadata: { prompt_version: 'stale', extra: 1 } },
      TOKEN
    );
    expect(res).toEqual({ ok: true });

    const rows = foodDb.db
      .select()
      .from(aiInferenceLog)
      .where(eq(aiInferenceLog.contextId, 'ingest_source:7'))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.domain).toBe('food');
    expect(rows[0]?.operation).toBe('recipe-extract-web-llm');
    // Server-authored prompt_version wins over caller-supplied metadata.
    expect(JSON.parse(rows[0]?.metadata ?? '{}').prompt_version).toBe('web-llm-v1.0');
  });

  it('rejects a request without the internal token (401)', async () => {
    await expect(client().ai.logInference(SAMPLE)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an invalid operation at the zod boundary (400) when authorised', async () => {
    await expect(
      client().ai.logInference({ ...SAMPLE, operation: 'not-a-real-op' }, TOKEN)
    ).rejects.toMatchObject({ status: 400 });
  });
});
