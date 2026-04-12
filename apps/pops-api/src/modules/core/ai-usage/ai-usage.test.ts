import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { createCaller } from '../../../shared/test-utils.js';
import { seedAiUsage, setupTestContext } from '../../../shared/test-utils.js';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('aiUsage.getStats', () => {
  it('returns zeros when no usage data exists', async () => {
    const result = await caller.core.aiUsage.getStats();
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
    seedAiUsage(db, {
      description: 'Categorise Woolworths',
      input_tokens: 150,
      output_tokens: 25,
      cost_usd: 0.003,
      cached: 0,
      created_at: new Date().toISOString(),
    });

    const result = await caller.core.aiUsage.getStats();
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
    // 2 API calls + 1 cache hit = 1/3 cache hit rate
    seedAiUsage(db, { cached: 0, cost_usd: 0.002, created_at: new Date().toISOString() });
    seedAiUsage(db, { cached: 0, cost_usd: 0.003, created_at: new Date().toISOString() });
    seedAiUsage(db, { cached: 1, cost_usd: 0.0001, created_at: new Date().toISOString() });

    const result = await caller.core.aiUsage.getStats();
    expect(result.totalApiCalls).toBe(2);
    expect(result.totalCacheHits).toBe(1);
    expect(result.cacheHitRate).toBeCloseTo(1 / 3);
    // Cached entries don't count toward cost
    expect(result.totalCost).toBeCloseTo(0.005);
    expect(result.avgCostPerCall).toBeCloseTo(0.0025);
  });
});

describe('aiUsage.getHistory', () => {
  it('returns empty records when no data exists', async () => {
    const result = await caller.core.aiUsage.getHistory({});
    expect(result.records).toEqual([]);
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.totalApiCalls).toBe(0);
    expect(result.summary.totalCacheHits).toBe(0);
  });

  it('returns correct shape for a single entry', async () => {
    seedAiUsage(db, {
      input_tokens: 200,
      output_tokens: 30,
      cost_usd: 0.005,
      cached: 0,
      created_at: '2026-03-15T10:00:00.000Z',
    });

    const result = await caller.core.aiUsage.getHistory({});
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
    seedAiUsage(db, { cost_usd: 0.001, created_at: '2026-03-01T10:00:00.000Z' });
    seedAiUsage(db, { cost_usd: 0.002, created_at: '2026-03-10T10:00:00.000Z' });
    seedAiUsage(db, { cost_usd: 0.003, created_at: '2026-03-20T10:00:00.000Z' });

    // Filter to only March 5-15
    const result = await caller.core.aiUsage.getHistory({
      startDate: '2026-03-05',
      endDate: '2026-03-15',
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.date).toBe('2026-03-10');
    expect(result.summary.totalApiCalls).toBe(1);
    expect(result.summary.totalCost).toBeCloseTo(0.002);
  });
});
