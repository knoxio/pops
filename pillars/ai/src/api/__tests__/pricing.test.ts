/**
 * Integration tests for the public pricing read `GET /ai-pricing/:p/:m`.
 *
 * Returns the per-Mtok USD `{ input, output }` pair the cross-pillar telemetry
 * wrapper fetches before `computeCostUsd`. Backed by `createPricingCache`, which
 * falls back to a default price on miss (so the route never 404s). NOT gated by
 * the internal token — callers fetch it cross-pillar.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiModelPricing, openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';

let tmpDir: string;
let aiDb: OpenedAiDb;
let app: ReturnType<typeof createAiApiApp>;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-pricing-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
  app = createAiApiApp({ aiDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3008' });
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /ai-pricing/:provider/:model', () => {
  it('returns the seeded { input, output } per-Mtok pair', async () => {
    const now = new Date().toISOString();
    aiDb.db
      .insert(aiModelPricing)
      .values({
        providerId: 'claude',
        modelId: 'claude-haiku-4-5',
        inputCostPerMtok: 0.8,
        outputCostPerMtok: 4,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const res = await supertest(app).get('/ai-pricing/claude/claude-haiku-4-5');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ input: 0.8, output: 4 });
  });

  it('falls back to the default price for an unknown provider/model (never 404s)', async () => {
    const res = await supertest(app).get('/ai-pricing/unknown/model-x');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ input: 1, output: 5 });
  });

  it('is NOT internal-token gated (public-readable)', async () => {
    // No x-pops-internal-token header — must still resolve.
    const res = await supertest(app).get('/ai-pricing/claude/anything');
    expect(res.status).toBe(200);
    expect(typeof res.body.input).toBe('number');
    expect(typeof res.body.output).toBe('number');
  });
});
