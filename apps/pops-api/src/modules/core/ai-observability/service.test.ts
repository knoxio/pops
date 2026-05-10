import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedAiUsage, setupTestContext } from '../../../shared/test-utils.js';
import * as service from './service.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('getStats', () => {
  it('returns zeros when no data exists', () => {
    const result = service.getStats();
    expect(result.totalCalls).toBe(0);
    expect(result.totalInputTokens).toBe(0);
    expect(result.totalOutputTokens).toBe(0);
    expect(result.totalCostUsd).toBe(0);
    expect(result.cacheHitRate).toBe(0);
    expect(result.errorRate).toBe(0);
    expect(result.byProvider).toHaveLength(0);
    expect(result.byModel).toHaveLength(0);
    expect(result.byDomain).toHaveLength(0);
    expect(result.byOperation).toHaveLength(0);
  });

  it('totals tokens and cost across entries', () => {
    seedAiUsage(db, { input_tokens: 100, output_tokens: 20, cost_usd: 0.001 });
    seedAiUsage(db, { input_tokens: 200, output_tokens: 40, cost_usd: 0.002 });

    const result = service.getStats();
    expect(result.totalCalls).toBe(2);
    expect(result.totalInputTokens).toBe(300);
    expect(result.totalOutputTokens).toBe(60);
    expect(result.totalCostUsd).toBeCloseTo(0.003);
  });

  it('computes cacheHitRate correctly', () => {
    seedAiUsage(db, { cached: 0 });
    seedAiUsage(db, { cached: 0 });
    seedAiUsage(db, { cached: 1 });

    const result = service.getStats();
    expect(result.totalCalls).toBe(3);
    expect(result.cacheHitRate).toBeCloseTo(1 / 3);
  });

  it('computes errorRate for error, timeout, and budget-blocked statuses', () => {
    seedAiUsage(db, { status: 'success' });
    seedAiUsage(db, { status: 'error' });
    seedAiUsage(db, { status: 'timeout' });
    seedAiUsage(db, { status: 'budget-blocked' });

    const result = service.getStats();
    expect(result.totalCalls).toBe(4);
    expect(result.errorRate).toBeCloseTo(3 / 4);
  });

  it('groups byProvider with correct aggregates', () => {
    seedAiUsage(db, { provider: 'claude', input_tokens: 100, output_tokens: 10, cost_usd: 0.001 });
    seedAiUsage(db, { provider: 'claude', input_tokens: 50, output_tokens: 5, cost_usd: 0.0005 });
    seedAiUsage(db, { provider: 'ollama', input_tokens: 200, output_tokens: 20, cost_usd: 0 });

    const result = service.getStats();
    expect(result.byProvider).toHaveLength(2);
    const claude = result.byProvider.find((p) => p.key === 'claude');
    expect(claude?.calls).toBe(2);
    expect(claude?.inputTokens).toBe(150);
    expect(claude?.costUsd).toBeCloseTo(0.0015);
  });

  it('groups byModel with correct call counts', () => {
    seedAiUsage(db, { model: 'haiku', input_tokens: 100, output_tokens: 10, cost_usd: 0.001 });
    seedAiUsage(db, { model: 'sonnet', input_tokens: 200, output_tokens: 20, cost_usd: 0.004 });
    seedAiUsage(db, { model: 'haiku', input_tokens: 50, output_tokens: 5, cost_usd: 0.0005 });

    const result = service.getStats();
    expect(result.byModel).toHaveLength(2);
    const haiku = result.byModel.find((m) => m.key === 'haiku');
    expect(haiku?.calls).toBe(2);
  });

  it('filters by provider', () => {
    seedAiUsage(db, { provider: 'claude' });
    seedAiUsage(db, { provider: 'ollama' });

    const result = service.getStats({ provider: 'claude' });
    expect(result.totalCalls).toBe(1);
    expect(result.byProvider).toHaveLength(1);
    expect(result.byProvider[0]?.key).toBe('claude');
  });

  it('domain filter "general" matches NULL domain rows', () => {
    // seedAiUsage uses `?? 'finance'` so passing null still inserts 'finance'.
    // Insert NULL-domain rows directly.
    const insertNullDomain = db.prepare(
      `INSERT INTO ai_inference_log (provider, model, operation, domain, input_tokens, output_tokens, cost_usd, latency_ms, status, cached, created_at)
       VALUES ('claude', 'haiku', 'entity-match', NULL, 100, 20, 0.001, 0, 'success', 0, ?)`
    );
    insertNullDomain.run(new Date().toISOString());
    insertNullDomain.run(new Date().toISOString());
    seedAiUsage(db, { domain: 'finance' });

    const result = service.getStats({ domain: 'general' });
    expect(result.totalCalls).toBe(2);
    expect(result.byDomain).toHaveLength(1);
    expect(result.byDomain[0]?.key).toBe('general');
  });

  it('domain filter for a named domain excludes NULL rows', () => {
    const insertNullDomain = db.prepare(
      `INSERT INTO ai_inference_log (provider, model, operation, domain, input_tokens, output_tokens, cost_usd, latency_ms, status, cached, created_at)
       VALUES ('claude', 'haiku', 'entity-match', NULL, 100, 20, 0.001, 0, 'success', 0, ?)`
    );
    insertNullDomain.run(new Date().toISOString());
    seedAiUsage(db, { domain: 'finance' });
    seedAiUsage(db, { domain: 'finance' });

    const result = service.getStats({ domain: 'finance' });
    expect(result.totalCalls).toBe(2);
  });
});

describe('getLatencyStats', () => {
  it('returns zeros when no data exists', () => {
    const result = service.getLatencyStats();
    expect(result.p50).toBe(0);
    expect(result.p75).toBe(0);
    expect(result.p95).toBe(0);
    expect(result.p99).toBe(0);
    expect(result.avg).toBe(0);
    expect(result.slowQueries).toHaveLength(0);
  });

  it('percentiles are ascending: P50 <= P75 <= P95 <= P99', () => {
    for (let i = 1; i <= 20; i++) {
      seedAiUsage(db, { latency_ms: i * 50, status: 'success', cached: 0 });
    }

    const result = service.getLatencyStats();
    expect(result.p50).toBeLessThanOrEqual(result.p75);
    expect(result.p75).toBeLessThanOrEqual(result.p95);
    expect(result.p95).toBeLessThanOrEqual(result.p99);
    expect(result.p50).toBeGreaterThan(0);
  });

  it('excludes cached entries from latency calculations', () => {
    seedAiUsage(db, { latency_ms: 100, status: 'success', cached: 0 });
    seedAiUsage(db, { latency_ms: 9999, status: 'success', cached: 1 });

    const result = service.getLatencyStats();
    expect(result.p50).toBe(100);
    expect(result.avg).toBe(100);
  });

  it('excludes non-success entries from latency calculations', () => {
    seedAiUsage(db, { latency_ms: 200, status: 'success', cached: 0 });
    seedAiUsage(db, { latency_ms: 9999, status: 'error', cached: 0 });
    seedAiUsage(db, { latency_ms: 9999, status: 'timeout', cached: 0 });

    const result = service.getLatencyStats();
    expect(result.p50).toBe(200);
    expect(result.avg).toBe(200);
  });
});

describe('integrated 100-row scenario', () => {
  it('aggregates correctly across mixed providers, models, operations, latencies, and statuses', () => {
    const providers = ['claude', 'ollama'];
    const models = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5', 'llama3:8b'];
    const operations = ['entity-match', 'rule-generation', 'embedding'];
    const statuses: Array<'success' | 'error' | 'timeout' | 'budget-blocked'> = [
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'success',
      'error',
      'timeout',
    ];

    let expectedTotalInputTokens = 0;
    let expectedTotalOutputTokens = 0;
    let expectedTotalCost = 0;
    let expectedSuccessSamples = 0;
    let expectedCacheHits = 0;
    let expectedErrors = 0;

    for (let i = 0; i < 100; i++) {
      const provider = providers[i % providers.length];
      const model = models[i % models.length];
      const operation = operations[i % operations.length];
      const status = statuses[i % statuses.length];
      const cached = i % 7 === 0 ? 1 : 0;
      const inputTokens = 100 + i;
      const outputTokens = 10 + (i % 5);
      const costUsd = (i % 5) * 0.0005;
      const latencyMs = cached === 1 ? 0 : 50 + (i % 50) * 10;
      const dayOffset = i % 5;
      const created = new Date(Date.UTC(2026, 2, 1 + dayOffset, 12, 0, 0)).toISOString();

      seedAiUsage(db, {
        provider,
        model,
        operation,
        status,
        cached,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        latency_ms: latencyMs,
        created_at: created,
      });

      expectedTotalInputTokens += inputTokens;
      expectedTotalOutputTokens += outputTokens;
      expectedTotalCost += costUsd;
      if (cached === 1) expectedCacheHits += 1;
      if (status === 'error' || status === 'timeout' || status === 'budget-blocked')
        expectedErrors += 1;
      if (status === 'success' && cached === 0 && latencyMs > 0) expectedSuccessSamples += 1;
    }

    const stats = service.getStats();
    expect(stats.totalCalls).toBe(100);
    expect(stats.totalInputTokens).toBe(expectedTotalInputTokens);
    expect(stats.totalOutputTokens).toBe(expectedTotalOutputTokens);
    expect(stats.totalCostUsd).toBeCloseTo(expectedTotalCost, 6);
    expect(stats.cacheHitRate).toBeCloseTo(expectedCacheHits / 100, 6);
    expect(stats.errorRate).toBeCloseTo(expectedErrors / 100, 6);
    expect(stats.byProvider.length).toBeGreaterThanOrEqual(2);
    expect(stats.byModel.length).toBeGreaterThanOrEqual(3);
    expect(stats.byOperation.length).toBeGreaterThanOrEqual(3);
    const sumProviderCalls = stats.byProvider.reduce((s, p) => s + p.calls, 0);
    expect(sumProviderCalls).toBe(100);

    const latency = service.getLatencyStats();
    // Sanity: we have enough successful, non-cached, latency>0 rows to populate every percentile.
    expect(expectedSuccessSamples).toBeGreaterThan(20);
    expect(latency.p50).toBeLessThanOrEqual(latency.p75);
    expect(latency.p75).toBeLessThanOrEqual(latency.p95);
    expect(latency.p95).toBeLessThanOrEqual(latency.p99);
    expect(latency.avg).toBeGreaterThan(0);

    const history = service.getHistory({ startDate: '2026-03-01', endDate: '2026-03-05' });
    // Five distinct day buckets.
    expect(history.records).toHaveLength(5);
    expect(history.summary.totalCalls).toBe(100);
    expect(history.summary.totalCostUsd).toBeCloseTo(expectedTotalCost, 6);
  });
});

describe('getHistory', () => {
  it('returns empty when no data exists', () => {
    const result = service.getHistory();
    expect(result.records).toHaveLength(0);
    expect(result.summary.totalCalls).toBe(0);
    expect(result.summary.totalCostUsd).toBe(0);
    expect(result.summary.totalCacheHits).toBe(0);
  });

  it('returns one row per day with aggregated data', () => {
    seedAiUsage(db, {
      created_at: '2026-03-01T08:00:00.000Z',
      cost_usd: 0.001,
      input_tokens: 100,
      output_tokens: 10,
    });
    seedAiUsage(db, {
      created_at: '2026-03-01T16:00:00.000Z',
      cost_usd: 0.002,
      input_tokens: 200,
      output_tokens: 20,
    });
    seedAiUsage(db, {
      created_at: '2026-03-02T10:00:00.000Z',
      cost_usd: 0.003,
      input_tokens: 150,
      output_tokens: 15,
    });

    const result = service.getHistory();
    expect(result.records).toHaveLength(2);
    const march1 = result.records.find((r) => r.date === '2026-03-01');
    expect(march1?.calls).toBe(2);
    expect(march1?.costUsd).toBeCloseTo(0.003);
    expect(march1?.inputTokens).toBe(300);
  });

  it('filters to the queried date range', () => {
    seedAiUsage(db, { created_at: '2026-03-01T10:00:00.000Z' });
    seedAiUsage(db, { created_at: '2026-03-10T10:00:00.000Z' });
    seedAiUsage(db, { created_at: '2026-03-20T10:00:00.000Z' });

    const result = service.getHistory({ startDate: '2026-03-05', endDate: '2026-03-15' });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.date).toBe('2026-03-10');
    expect(result.summary.totalCalls).toBe(1);
  });

  it('summary aggregates totalCostUsd and totalCacheHits across all records', () => {
    seedAiUsage(db, { created_at: '2026-03-01T10:00:00.000Z', cost_usd: 0.001, cached: 1 });
    seedAiUsage(db, { created_at: '2026-03-02T10:00:00.000Z', cost_usd: 0.002, cached: 0 });

    const result = service.getHistory();
    expect(result.summary.totalCalls).toBe(2);
    expect(result.summary.totalCostUsd).toBeCloseTo(0.003);
    expect(result.summary.totalCacheHits).toBe(1);
  });
});
