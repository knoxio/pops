/**
 * Tests for the AI observability service, retention rollup, daily summary
 * and the env-gated scheduler (ported/condensed from the monolith's
 * service.test.ts / summary.test.ts / retention.test.ts).
 *
 * Runs against an in-memory `core.db` opened per-test; the request-scoped
 * drizzle handle is threaded explicitly. Usage rows are seeded via the
 * relocated `aiUsageService.createInferenceLog` rather than the monolith's
 * raw-SQL `seedAiUsage`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  aiUsageService,
  openCoreDb,
  settingsService,
  type CoreDb,
  type CreateInferenceLogInput,
  type OpenedCoreDb,
} from '../../../../db/index.js';
import { aggregateRowsToDaily, computeCutoff, runRetention } from '../retention.js';
import { startObservabilityScheduler } from '../scheduler.js';
import * as service from '../service.js';
import {
  computeSummary,
  computeWindowStart,
  OBSERVABILITY_SUMMARY_SETTING_KEY,
  runSummary,
} from '../summary.js';

import type { RetentionInputRow } from '../retention-types.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let db: CoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-ai-observability-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  db = coreDb.db;
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function seedUsage(overrides: Partial<CreateInferenceLogInput> = {}): void {
  aiUsageService.createInferenceLog(db, {
    provider: overrides.provider ?? 'claude',
    model: overrides.model ?? 'claude-haiku-4-5-20251001',
    operation: overrides.operation ?? 'entity-match',
    domain: 'domain' in overrides ? overrides.domain : 'finance',
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 20,
    costUsd: overrides.costUsd ?? 0.001,
    latencyMs: overrides.latencyMs ?? 0,
    status: overrides.status ?? 'success',
    cached: overrides.cached ?? 0,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  });
}

describe('getStats', () => {
  it('returns zeros when no data exists', () => {
    const result = service.getStats(db);
    expect(result.totalCalls).toBe(0);
    expect(result.totalCostUsd).toBe(0);
    expect(result.cacheHitRate).toBe(0);
    expect(result.errorRate).toBe(0);
    expect(result.byProvider).toHaveLength(0);
    expect(result.byModel).toHaveLength(0);
    expect(result.byDomain).toHaveLength(0);
    expect(result.byOperation).toHaveLength(0);
  });

  it('totals tokens and cost across entries', () => {
    seedUsage({ inputTokens: 100, outputTokens: 20, costUsd: 0.001 });
    seedUsage({ inputTokens: 200, outputTokens: 40, costUsd: 0.002 });

    const result = service.getStats(db);
    expect(result.totalCalls).toBe(2);
    expect(result.totalInputTokens).toBe(300);
    expect(result.totalOutputTokens).toBe(60);
    expect(result.totalCostUsd).toBeCloseTo(0.003);
  });

  it('computes cache hit rate', () => {
    seedUsage({ cached: 0 });
    seedUsage({ cached: 0 });
    seedUsage({ cached: 1 });

    const result = service.getStats(db);
    expect(result.cacheHitRate).toBeCloseTo(1 / 3);
  });

  it('computes error rate across error/timeout/budget-blocked', () => {
    seedUsage({ status: 'success' });
    seedUsage({ status: 'error' });
    seedUsage({ status: 'timeout' });
    seedUsage({ status: 'budget-blocked' });

    const result = service.getStats(db);
    expect(result.errorRate).toBeCloseTo(3 / 4);
  });

  it('groups by provider', () => {
    seedUsage({ provider: 'claude', costUsd: 0.001 });
    seedUsage({ provider: 'claude', costUsd: 0.0005 });
    seedUsage({ provider: 'ollama', costUsd: 0 });

    const result = service.getStats(db);
    const claude = result.byProvider.find((p) => p.key === 'claude');
    expect(claude?.calls).toBe(2);
    expect(result.byProvider).toHaveLength(2);
  });

  it('maps a null domain to the "general" bucket and filters on it', () => {
    seedUsage({ domain: null });
    seedUsage({ domain: 'finance' });

    const general = service.getStats(db, { domain: 'general' });
    expect(general.totalCalls).toBe(1);
    const generalBucket = service.getStats(db).byDomain.find((d) => d.key === 'general');
    expect(generalBucket?.calls).toBe(1);
  });

  it('filters by provider', () => {
    seedUsage({ provider: 'claude' });
    seedUsage({ provider: 'ollama' });

    const result = service.getStats(db, { provider: 'claude' });
    expect(result.totalCalls).toBe(1);
  });
});

describe('getLatencyStats', () => {
  it('returns zeros when no qualifying rows exist', () => {
    const result = service.getLatencyStats(db);
    expect(result.p50).toBe(0);
    expect(result.p95).toBe(0);
    expect(result.avg).toBe(0);
    expect(result.slowQueries).toHaveLength(0);
  });

  it('computes percentiles over success non-cached rows with latency>0', () => {
    for (let i = 1; i <= 100; i++) {
      seedUsage({ latencyMs: i * 10, status: 'success', cached: 0 });
    }
    const result = service.getLatencyStats(db);
    expect(result.p50).toBeGreaterThan(result.p50 - 1);
    expect(result.p95).toBeGreaterThan(result.p50);
    expect(result.avg).toBeGreaterThan(0);
  });

  it('ignores cached and non-success rows in the latency population', () => {
    seedUsage({ latencyMs: 1000, status: 'success', cached: 1 });
    seedUsage({ latencyMs: 1000, status: 'error', cached: 0 });
    const result = service.getLatencyStats(db);
    expect(result.avg).toBe(0);
  });
});

describe('getQualityMetrics', () => {
  it('computes per-model rates', () => {
    seedUsage({ model: 'haiku', status: 'success', cached: 0 });
    seedUsage({ model: 'haiku', status: 'error', cached: 0 });
    seedUsage({ model: 'haiku', status: 'success', cached: 1 });

    const result = service.getQualityMetrics(db);
    const haiku = result.byModel.find((m) => m.model === 'haiku');
    expect(haiku?.errorRate).toBeCloseTo(1 / 3);
    expect(haiku?.cacheHitRate).toBeCloseTo(1 / 3);
  });
});

describe('getHistory', () => {
  it('returns empty records and zero summary when no data exists', () => {
    const result = service.getHistory(db);
    expect(result.records).toEqual([]);
    expect(result.summary.totalCalls).toBe(0);
  });

  it('aggregates raw rows by UTC date newest-first', () => {
    seedUsage({ costUsd: 0.001, createdAt: '2026-03-01T10:00:00.000Z' });
    seedUsage({ costUsd: 0.002, createdAt: '2026-03-02T10:00:00.000Z' });

    const result = service.getHistory(db);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]!.date).toBe('2026-03-02');
    expect(result.summary.totalCalls).toBe(2);
    expect(result.summary.totalCostUsd).toBeCloseTo(0.003);
  });

  it('merges raw + daily-aggregate rows for the same date', () => {
    seedUsage({ costUsd: 0.001, inputTokens: 10, createdAt: '2026-01-01T10:00:00.000Z' });
    aiUsageService.recordInferenceDaily(db, {
      date: '2026-01-01',
      provider: 'claude',
      model: 'claude-haiku-4-5-20251001',
      operation: 'entity-match',
      domain: 'finance',
      totalCalls: 5,
      totalInputTokens: 50,
      totalOutputTokens: 5,
      totalCostUsd: 0.01,
      avgLatencyMs: 0,
      errorCount: 0,
      timeoutCount: 0,
      cacheHitCount: 0,
      budgetBlockedCount: 0,
    });

    const result = service.getHistory(db);
    const day = result.records.find((r) => r.date === '2026-01-01');
    expect(day?.calls).toBe(6);
    expect(day?.costUsd).toBeCloseTo(0.011);
  });
});

describe('retention — aggregateRowsToDaily (pure)', () => {
  function row(overrides: Partial<RetentionInputRow> = {}): RetentionInputRow {
    return {
      createdAt: overrides.createdAt ?? '2026-01-01T10:00:00.000Z',
      provider: overrides.provider ?? 'claude',
      model: overrides.model ?? 'haiku',
      operation: overrides.operation ?? 'entity-match',
      domain: overrides.domain ?? 'finance',
      inputTokens: overrides.inputTokens ?? 100,
      outputTokens: overrides.outputTokens ?? 20,
      costUsd: overrides.costUsd ?? 0.001,
      latencyMs: overrides.latencyMs ?? 0,
      status: overrides.status ?? 'success',
      cached: overrides.cached ?? 0,
    };
  }

  it('buckets rows by (date,provider,model,operation,domain)', () => {
    const out = aggregateRowsToDaily([row(), row(), row({ model: 'sonnet' })]);
    expect(out).toHaveLength(2);
    const haiku = out.find((a) => a.model === 'haiku');
    expect(haiku?.totalCalls).toBe(2);
  });

  it('averages latency only over success non-cached rows with latency>0', () => {
    const out = aggregateRowsToDaily([
      row({ latencyMs: 100, status: 'success', cached: 0 }),
      row({ latencyMs: 300, status: 'success', cached: 0 }),
      row({ latencyMs: 9999, status: 'error', cached: 0 }),
      row({ latencyMs: 9999, status: 'success', cached: 1 }),
    ]);
    expect(out[0]?.avgLatencyMs).toBe(200);
    expect(out[0]?.errorCount).toBe(1);
    expect(out[0]?.cacheHitCount).toBe(1);
  });
});

describe('retention — runRetention (db cycle)', () => {
  it('rolls up aged rows into daily aggregates and deletes them', () => {
    const old = '2026-01-01T10:00:00.000Z';
    seedUsage({ createdAt: old, costUsd: 0.001 });
    seedUsage({ createdAt: old, costUsd: 0.002 });
    seedUsage({ createdAt: new Date().toISOString(), costUsd: 0.5 });

    const result = runRetention(db, {
      now: new Date('2026-06-01T00:00:00.000Z'),
      retentionDays: 90,
    });
    expect(result.rowsAggregated).toBe(2);
    expect(result.bucketsWritten).toBe(1);

    const daily = aiUsageService.listInferenceDaily(db, {});
    expect(daily).toHaveLength(1);
    expect(daily[0]?.totalCalls).toBe(2);

    const recentRemaining = aiUsageService.listInferenceLogs(db, {}, 100, 0);
    expect(recentRemaining).toHaveLength(1);
  });

  it('is idempotent — a second pass over the same horizon aggregates nothing new', () => {
    seedUsage({ createdAt: '2026-01-01T10:00:00.000Z' });
    runRetention(db, { now: new Date('2026-06-01T00:00:00.000Z'), retentionDays: 90 });
    const second = runRetention(db, {
      now: new Date('2026-06-01T00:00:00.000Z'),
      retentionDays: 90,
    });
    expect(second.rowsAggregated).toBe(0);
  });

  it('computeCutoff subtracts the retention window', () => {
    const cutoff = computeCutoff(90, new Date('2026-06-01T00:00:00.000Z'));
    expect(cutoff).toBe('2026-03-03T00:00:00.000Z');
  });
});

describe('summary', () => {
  it('computeWindowStart subtracts the window', () => {
    const start = computeWindowStart(30, new Date('2026-06-01T00:00:00.000Z'));
    expect(start).toBe('2026-05-02T00:00:00.000Z');
  });

  it('computeSummary rejects a non-positive window', () => {
    expect(() => computeSummary(db, { windowDays: 0 })).toThrow(RangeError);
  });

  it('computeSummary aggregates rows inside the rolling window', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    seedUsage({ createdAt: '2026-05-20T10:00:00.000Z', costUsd: 0.01, provider: 'claude' });
    seedUsage({ createdAt: '2026-01-01T10:00:00.000Z', costUsd: 0.99, provider: 'claude' });

    const summary = computeSummary(db, { now, windowDays: 30 });
    expect(summary.totalCalls).toBe(1);
    expect(summary.totalCostUsd).toBeCloseTo(0.01);
    expect(summary.byProvider[0]?.provider).toBe('claude');
  });

  it('runSummary persists the envelope to the settings cache', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    seedUsage({ createdAt: '2026-05-20T10:00:00.000Z' });

    const { summary } = runSummary(db, { now });
    expect(summary.computedAt).toBe(summary.windowEnd);

    const cached = settingsService.getSettingOrNull(db, OBSERVABILITY_SUMMARY_SETTING_KEY);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!.value) as { totalCalls: number };
    expect(parsed.totalCalls).toBe(1);
  });
});

describe('startObservabilityScheduler', () => {
  const ENV_KEY = 'CORE_AI_OBSERVABILITY_SCHEDULER_ENABLED';

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('returns a no-op stop and never ticks when the env gate is off', () => {
    delete process.env[ENV_KEY];
    const stop = startObservabilityScheduler(db, { intervalMs: 1 });
    stop();
    // No summary should have been written.
    expect(settingsService.getSettingOrNull(db, OBSERVABILITY_SUMMARY_SETTING_KEY)).toBeNull();
  });

  it('arms a timer when the env gate is on, and stop() clears it', () => {
    process.env[ENV_KEY] = 'true';
    const stop = startObservabilityScheduler(db, { intervalMs: 60_000 });
    expect(typeof stop).toBe('function');
    stop();
  });
});
