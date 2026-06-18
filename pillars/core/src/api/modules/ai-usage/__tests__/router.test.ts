/**
 * Tests for the `core.aiUsage.*` tRPC router (ported from
 * `apps/pops-api/src/modules/core/ai-usage/ai-usage.test.ts`).
 *
 * Runs against an in-memory `core.db` opened per-test via `openCoreDb`.
 * Usage rows are seeded through the relocated `aiUsageService` rather
 * than the monolith's raw-SQL `seedAiUsage` helper so the seam under
 * test is the wire surface only — the dashboard aggregation SQL is
 * already covered by the db package's own suite.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiUsageService, openCoreDb, type OpenedCoreDb } from '../../../../db/index.js';
import { appRouter } from '../../../router.js';
import { type Context } from '../../../trpc.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-ai-usage-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function userCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email: 'admin@example.com' },
    serviceAccount: null,
    coreDb: coreDb.db,
  };
  return appRouter.createCaller(ctx);
}

function seedUsage(overrides: {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  cached?: number;
  createdAt?: string;
}): void {
  aiUsageService.createInferenceLog(coreDb.db, {
    provider: 'claude',
    model: 'claude-haiku-4-5-20251001',
    operation: 'entity-match',
    domain: 'finance',
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 20,
    costUsd: overrides.costUsd ?? 0.001,
    latencyMs: 0,
    status: 'success',
    cached: overrides.cached ?? 0,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  });
}

describe('core.aiUsage.getStats', () => {
  it('returns zeros when no usage data exists', async () => {
    const result = await userCaller().core.aiUsage.getStats();
    expect(result.totalCost).toBe(0);
    expect(result.totalApiCalls).toBe(0);
    expect(result.totalCacheHits).toBe(0);
    expect(result.cacheHitRate).toBe(0);
    expect(result.avgCostPerCall).toBe(0);
    expect(result.totalInputTokens).toBe(0);
    expect(result.totalOutputTokens).toBe(0);
    expect(result.last30Days).toBeUndefined();
  });

  it('returns correct stats for a single entry', async () => {
    seedUsage({
      inputTokens: 150,
      outputTokens: 25,
      costUsd: 0.003,
      cached: 0,
      createdAt: new Date().toISOString(),
    });

    const result = await userCaller().core.aiUsage.getStats();
    expect(result.totalCost).toBeCloseTo(0.003);
    expect(result.totalApiCalls).toBe(1);
    expect(result.totalCacheHits).toBe(0);
    expect(result.cacheHitRate).toBe(0);
    expect(result.avgCostPerCall).toBeCloseTo(0.003);
    expect(result.totalInputTokens).toBe(150);
    expect(result.totalOutputTokens).toBe(25);
    expect(result.last30Days).toBeDefined();
    expect(result.last30Days!.apiCalls).toBe(1);
  });

  it('calculates cache hit rate correctly', async () => {
    seedUsage({ cached: 0, costUsd: 0.002, createdAt: new Date().toISOString() });
    seedUsage({ cached: 0, costUsd: 0.003, createdAt: new Date().toISOString() });
    seedUsage({ cached: 1, costUsd: 0.0001, createdAt: new Date().toISOString() });

    const result = await userCaller().core.aiUsage.getStats();
    expect(result.totalApiCalls).toBe(2);
    expect(result.totalCacheHits).toBe(1);
    expect(result.cacheHitRate).toBeCloseTo(1 / 3);
    expect(result.totalCost).toBeCloseTo(0.005);
    expect(result.avgCostPerCall).toBeCloseTo(0.0025);
  });
});

describe('core.aiUsage.getHistory', () => {
  it('returns empty records when no data exists', async () => {
    const result = await userCaller().core.aiUsage.getHistory({});
    expect(result.records).toEqual([]);
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.totalApiCalls).toBe(0);
    expect(result.summary.totalCacheHits).toBe(0);
  });

  it('returns correct shape for a single entry', async () => {
    seedUsage({
      inputTokens: 200,
      outputTokens: 30,
      costUsd: 0.005,
      cached: 0,
      createdAt: '2026-03-15T10:00:00.000Z',
    });

    const result = await userCaller().core.aiUsage.getHistory({});
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      date: '2026-03-15',
      apiCalls: 1,
      cacheHits: 0,
      inputTokens: 200,
      outputTokens: 30,
      cost: 0.005,
    });
    expect(result.summary.totalCost).toBeCloseTo(0.005);
    expect(result.summary.totalApiCalls).toBe(1);
  });

  it('filters by date range', async () => {
    seedUsage({ costUsd: 0.001, createdAt: '2026-03-01T10:00:00.000Z' });
    seedUsage({ costUsd: 0.002, createdAt: '2026-03-10T10:00:00.000Z' });
    seedUsage({ costUsd: 0.003, createdAt: '2026-03-20T10:00:00.000Z' });

    const result = await userCaller().core.aiUsage.getHistory({
      startDate: '2026-03-05',
      endDate: '2026-03-15',
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.date).toBe('2026-03-10');
    expect(result.summary.totalApiCalls).toBe(1);
    expect(result.summary.totalCost).toBeCloseTo(0.002);
  });
});
