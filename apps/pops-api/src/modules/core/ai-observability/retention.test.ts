/**
 * Unit tests for the AI inference log retention job (PRD-092 US-08).
 *
 * The aggregator is exercised twice — once as a pure function with crafted
 * input rows, once end-to-end against an in-memory SQLite DB to validate
 * the upsert + delete cycle and idempotency.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedAiUsage, setupTestContext } from '../../../shared/test-utils.js';
import {
  aggregateRowsToDaily,
  computeCutoff,
  runRetention,
  type RetentionInputRow,
} from './retention.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysAgo = (days: number, hour = 12): string => {
  const d = new Date(Date.UTC(2026, 4, 11, hour, 0, 0)); // anchor: 2026-05-11T12:00:00Z
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
};

function makeRow(over: Partial<RetentionInputRow> = {}): RetentionInputRow {
  return {
    createdAt: '2025-01-01T00:00:00Z',
    provider: 'claude',
    model: 'claude-haiku',
    operation: 'entity-match',
    domain: 'finance',
    inputTokens: 100,
    outputTokens: 20,
    costUsd: 0.001,
    latencyMs: 500,
    status: 'success',
    cached: 0,
    ...over,
  };
}

describe('aggregateRowsToDaily', () => {
  it('returns an empty array for no input', () => {
    expect(aggregateRowsToDaily([])).toEqual([]);
  });

  it('groups rows by (date, provider, model, operation, domain)', () => {
    const rows = [
      makeRow({ createdAt: '2026-01-01T10:00:00Z' }),
      makeRow({ createdAt: '2026-01-01T11:00:00Z' }),
      makeRow({ createdAt: '2026-01-02T10:00:00Z' }),
    ];
    const buckets = aggregateRowsToDaily(rows);
    expect(buckets).toHaveLength(2);
    const jan1 = buckets.find((b) => b.date === '2026-01-01');
    expect(jan1?.totalCalls).toBe(2);
    expect(jan1?.totalInputTokens).toBe(200);
    expect(jan1?.totalCostUsd).toBeCloseTo(0.002);
  });

  it('treats null and non-null domains as distinct buckets', () => {
    const rows = [
      makeRow({ createdAt: '2026-01-01T10:00:00Z', domain: null }),
      makeRow({ createdAt: '2026-01-01T10:00:00Z', domain: 'finance' }),
    ];
    const buckets = aggregateRowsToDaily(rows);
    expect(buckets).toHaveLength(2);
    expect(buckets.some((b) => b.domain === null && b.totalCalls === 1)).toBe(true);
    expect(buckets.some((b) => b.domain === 'finance' && b.totalCalls === 1)).toBe(true);
  });

  it('counts errors, timeouts, cache hits and budget blocks separately', () => {
    const rows = [
      makeRow({ status: 'success', cached: 0, latencyMs: 100 }),
      makeRow({ status: 'success', cached: 1, latencyMs: 0 }),
      makeRow({ status: 'error', latencyMs: 0 }),
      makeRow({ status: 'timeout', latencyMs: 0 }),
      makeRow({ status: 'budget-blocked', latencyMs: 0 }),
    ];
    const [bucket] = aggregateRowsToDaily(rows);
    expect(bucket?.totalCalls).toBe(5);
    expect(bucket?.errorCount).toBe(1);
    expect(bucket?.timeoutCount).toBe(1);
    expect(bucket?.budgetBlockedCount).toBe(1);
    expect(bucket?.cacheHitCount).toBe(1);
  });

  it('computes avgLatencyMs from non-cached success rows only', () => {
    const rows = [
      makeRow({ latencyMs: 100, status: 'success', cached: 0 }),
      makeRow({ latencyMs: 200, status: 'success', cached: 0 }),
      makeRow({ latencyMs: 9999, status: 'success', cached: 1 }), // cached — excluded
      makeRow({ latencyMs: 9999, status: 'error' }), // failed — excluded
    ];
    const [bucket] = aggregateRowsToDaily(rows);
    expect(bucket?.avgLatencyMs).toBe(150);
  });

  it('returns avgLatencyMs=0 when every row is cached or failed', () => {
    const rows = [
      makeRow({ latencyMs: 0, status: 'success', cached: 1 }),
      makeRow({ latencyMs: 0, status: 'error' }),
    ];
    const [bucket] = aggregateRowsToDaily(rows);
    expect(bucket?.avgLatencyMs).toBe(0);
  });
});

describe('computeCutoff', () => {
  it('subtracts the retention window from now', () => {
    const now = new Date('2026-05-11T12:00:00Z');
    expect(computeCutoff(90, now)).toBe(new Date(now.getTime() - 90 * DAY_MS).toISOString());
  });
});

describe('runRetention end-to-end', () => {
  it('aggregates aged rows into ai_inference_daily and deletes them', () => {
    // 50 rows older than 91 days, varied across two date buckets.
    for (let i = 0; i < 25; i++) {
      seedAiUsage(db, {
        created_at: isoDaysAgo(95),
        input_tokens: 10,
        output_tokens: 2,
        cost_usd: 0.0001,
        latency_ms: 100,
        status: 'success',
        cached: 0,
      });
    }
    for (let i = 0; i < 25; i++) {
      seedAiUsage(db, {
        created_at: isoDaysAgo(96),
        input_tokens: 20,
        output_tokens: 4,
        cost_usd: 0.0002,
        latency_ms: 200,
        status: 'success',
        cached: 0,
      });
    }

    const result = runRetention({
      retentionDays: 90,
      now: new Date('2026-05-11T12:00:00Z'),
      db,
    });

    expect(result.rowsAggregated).toBe(50);
    expect(result.bucketsWritten).toBe(2);

    const remaining = db.prepare('SELECT COUNT(*) as c FROM ai_inference_log').get() as {
      c: number;
    };
    expect(remaining.c).toBe(0);

    const buckets = db.prepare('SELECT * FROM ai_inference_daily ORDER BY date').all() as {
      date: string;
      total_calls: number;
      total_input_tokens: number;
      total_cost_usd: number;
      avg_latency_ms: number;
    }[];
    expect(buckets).toHaveLength(2);
    expect(buckets[0]?.total_calls).toBe(25);
    expect(buckets[0]?.total_input_tokens).toBe(25 * 20);
    expect(buckets[0]?.avg_latency_ms).toBe(200);
    expect(buckets[1]?.total_calls).toBe(25);
    expect(buckets[1]?.total_input_tokens).toBe(25 * 10);
    expect(buckets[1]?.avg_latency_ms).toBe(100);

    // Idempotency: a second pass with no aged rows is a no-op.
    const second = runRetention({
      retentionDays: 90,
      now: new Date('2026-05-11T12:00:00Z'),
      db,
    });
    expect(second.rowsAggregated).toBe(0);
    expect(second.bucketsWritten).toBe(0);
    expect(second.batches).toBe(0);
  });

  it('leaves rows within the retention window untouched', () => {
    seedAiUsage(db, { created_at: isoDaysAgo(30) });
    seedAiUsage(db, { created_at: isoDaysAgo(89) });
    seedAiUsage(db, { created_at: isoDaysAgo(91) });

    const result = runRetention({
      retentionDays: 90,
      now: new Date('2026-05-11T12:00:00Z'),
      db,
    });

    expect(result.rowsAggregated).toBe(1);

    const remaining = db.prepare('SELECT COUNT(*) as c FROM ai_inference_log').get() as {
      c: number;
    };
    expect(remaining.c).toBe(2);
  });

  it('increments existing daily aggregate rows on the same key (does not replace)', () => {
    // First batch: 5 rows on day -100 with 10 input tokens each.
    for (let i = 0; i < 5; i++) {
      seedAiUsage(db, {
        created_at: isoDaysAgo(100),
        input_tokens: 10,
        output_tokens: 0,
        cost_usd: 0.0001,
        latency_ms: 100,
        status: 'success',
        cached: 0,
      });
    }

    runRetention({
      retentionDays: 90,
      now: new Date('2026-05-11T12:00:00Z'),
      db,
    });

    // Second batch: 3 more rows on the SAME day, same tuple, with different
    // latency. They land in `ai_inference_log` and we re-run retention.
    for (let i = 0; i < 3; i++) {
      seedAiUsage(db, {
        created_at: isoDaysAgo(100),
        input_tokens: 100,
        output_tokens: 0,
        cost_usd: 0.001,
        latency_ms: 200,
        status: 'success',
        cached: 0,
      });
    }

    runRetention({
      retentionDays: 90,
      now: new Date('2026-05-11T12:00:00Z'),
      db,
    });

    const rows = db.prepare('SELECT * FROM ai_inference_daily').all() as {
      total_calls: number;
      total_input_tokens: number;
      total_cost_usd: number;
      avg_latency_ms: number;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total_calls).toBe(8); // 5 + 3
    expect(rows[0]?.total_input_tokens).toBe(5 * 10 + 3 * 100); // summed
    expect(rows[0]?.total_cost_usd).toBeCloseTo(5 * 0.0001 + 3 * 0.001);
    // Weighted avg: previous bucket had 5 calls @ 100ms, second had 3 calls @
    // 200ms. The upsert weights by total_calls, so ((5*100) + (3*200)) / 8 = 137.5 → 137.
    expect(rows[0]?.avg_latency_ms).toBe(137);
  });

  it('processes rows across multiple batches when more than batch_size are aged', () => {
    for (let i = 0; i < 25; i++) {
      seedAiUsage(db, {
        created_at: isoDaysAgo(100 + (i % 5)), // 5 distinct daily buckets
        input_tokens: 1,
      });
    }

    const result = runRetention({
      retentionDays: 90,
      batchSize: 10,
      now: new Date('2026-05-11T12:00:00Z'),
      db,
    });

    expect(result.rowsAggregated).toBe(25);
    expect(result.batches).toBe(3); // ceil(25 / 10)

    const rows = db.prepare('SELECT COUNT(*) as c FROM ai_inference_log').get() as {
      c: number;
    };
    expect(rows.c).toBe(0);
  });
});
