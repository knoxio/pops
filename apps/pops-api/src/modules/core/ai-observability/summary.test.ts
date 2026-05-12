/**
 * Unit tests for the daily observability summary job (PRD-092 US-05).
 *
 * `computeSummary` is exercised against a seeded in-memory DB; `runSummary`
 * is exercised end-to-end to verify the JSON envelope is persisted to the
 * `ai.observabilitySummary` settings row.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedAiUsage, setupTestContext } from '../../../shared/test-utils.js';
import { getSettingOrNull } from '../settings/service.js';
import {
  OBSERVABILITY_SUMMARY_SETTING_KEY,
  computeSummary,
  computeWindowStart,
  runSummary,
} from './summary.js';

import type { Database } from 'better-sqlite3';

import type { ObservabilitySummaryEnvelope } from './summary.js';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

const NOW = new Date('2026-05-12T03:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysAgo = (days: number, hour = 12): string => {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('computeWindowStart', () => {
  it('subtracts the window in milliseconds from now', () => {
    expect(computeWindowStart(30, NOW)).toBe(new Date(NOW.getTime() - 30 * DAY_MS).toISOString());
  });
});

describe('computeSummary', () => {
  it('returns zeros when there is no data', () => {
    const summary = computeSummary({ now: NOW });
    expect(summary.totalCalls).toBe(0);
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.cacheHitRate).toBe(0);
    expect(summary.errorRate).toBe(0);
    expect(summary.byProvider).toHaveLength(0);
    expect(summary.byModel).toHaveLength(0);
    expect(summary.windowEnd).toBe(NOW.toISOString());
    expect(summary.windowStart).toBe(computeWindowStart(30, NOW));
  });

  it('aggregates totals across rows in the window', () => {
    seedAiUsage(db, {
      created_at: isoDaysAgo(1),
      input_tokens: 100,
      output_tokens: 20,
      cost_usd: 0.001,
    });
    seedAiUsage(db, {
      created_at: isoDaysAgo(5),
      input_tokens: 200,
      output_tokens: 40,
      cost_usd: 0.002,
    });

    const summary = computeSummary({ now: NOW });
    expect(summary.totalCalls).toBe(2);
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(60);
    expect(summary.totalCostUsd).toBeCloseTo(0.003);
  });

  it('ignores rows older than the 30-day window', () => {
    seedAiUsage(db, { created_at: isoDaysAgo(1) });
    seedAiUsage(db, { created_at: isoDaysAgo(29) });
    seedAiUsage(db, { created_at: isoDaysAgo(31) });
    seedAiUsage(db, { created_at: isoDaysAgo(90) });

    const summary = computeSummary({ now: NOW });
    expect(summary.totalCalls).toBe(2);
  });

  it('ignores rows with future timestamps (after windowEnd)', () => {
    // In-window baseline.
    seedAiUsage(db, { created_at: isoDaysAgo(1) });
    // Future-dated rows — bogus clock skew or backdated inserts — must not
    // be counted in the rolling window.
    const oneMinuteAhead = new Date(NOW.getTime() + 60_000).toISOString();
    const oneDayAhead = new Date(NOW.getTime() + DAY_MS).toISOString();
    seedAiUsage(db, { created_at: oneMinuteAhead });
    seedAiUsage(db, { created_at: oneDayAhead });

    const summary = computeSummary({ now: NOW });
    expect(summary.totalCalls).toBe(1);
  });

  it('computes cacheHitRate and errorRate as fractions of total calls', () => {
    seedAiUsage(db, { created_at: isoDaysAgo(1), cached: 1, status: 'success' });
    seedAiUsage(db, { created_at: isoDaysAgo(1), cached: 0, status: 'success' });
    seedAiUsage(db, { created_at: isoDaysAgo(1), cached: 0, status: 'error' });
    seedAiUsage(db, { created_at: isoDaysAgo(1), cached: 0, status: 'timeout' });
    seedAiUsage(db, { created_at: isoDaysAgo(1), cached: 0, status: 'budget-blocked' });

    const summary = computeSummary({ now: NOW });
    expect(summary.totalCalls).toBe(5);
    expect(summary.cacheHitRate).toBeCloseTo(1 / 5);
    expect(summary.errorRate).toBeCloseTo(3 / 5);
  });

  it('groups by provider with descending call counts', () => {
    seedAiUsage(db, { created_at: isoDaysAgo(1), provider: 'claude' });
    seedAiUsage(db, { created_at: isoDaysAgo(1), provider: 'claude' });
    seedAiUsage(db, { created_at: isoDaysAgo(1), provider: 'openai' });

    const summary = computeSummary({ now: NOW });
    expect(summary.byProvider).toHaveLength(2);
    expect(summary.byProvider[0]?.provider).toBe('claude');
    expect(summary.byProvider[0]?.calls).toBe(2);
    expect(summary.byProvider[1]?.provider).toBe('openai');
    expect(summary.byProvider[1]?.calls).toBe(1);
  });

  it('groups by model and computes avgLatencyMs over success non-cached rows only', () => {
    // 2 qualifying success rows for model-a: 100ms, 200ms → avg 150.
    seedAiUsage(db, {
      created_at: isoDaysAgo(1),
      model: 'model-a',
      latency_ms: 100,
      status: 'success',
      cached: 0,
    });
    seedAiUsage(db, {
      created_at: isoDaysAgo(1),
      model: 'model-a',
      latency_ms: 200,
      status: 'success',
      cached: 0,
    });
    // Cached and failed rows for model-a — excluded from the latency avg.
    seedAiUsage(db, {
      created_at: isoDaysAgo(1),
      model: 'model-a',
      latency_ms: 9999,
      status: 'success',
      cached: 1,
    });
    seedAiUsage(db, {
      created_at: isoDaysAgo(1),
      model: 'model-a',
      latency_ms: 9999,
      status: 'error',
      cached: 0,
    });
    // A second model with no qualifying rows — latency falls back to 0.
    seedAiUsage(db, {
      created_at: isoDaysAgo(1),
      model: 'model-b',
      latency_ms: 9999,
      status: 'error',
      cached: 0,
    });

    const summary = computeSummary({ now: NOW });
    const a = summary.byModel.find((m) => m.model === 'model-a');
    const b = summary.byModel.find((m) => m.model === 'model-b');
    expect(a?.calls).toBe(4);
    expect(a?.avgLatencyMs).toBe(150);
    expect(b?.calls).toBe(1);
    expect(b?.avgLatencyMs).toBe(0);
  });
});

describe('runSummary', () => {
  it('persists the computed envelope to the ai.observabilitySummary settings row', () => {
    seedAiUsage(db, { created_at: isoDaysAgo(1), input_tokens: 50, cost_usd: 0.0005 });
    seedAiUsage(db, { created_at: isoDaysAgo(2), input_tokens: 50, cost_usd: 0.0005 });

    const { summary } = runSummary({ now: NOW });
    expect(summary.totalCalls).toBe(2);
    expect(summary.computedAt).toBe(NOW.toISOString());

    const row = getSettingOrNull(OBSERVABILITY_SUMMARY_SETTING_KEY);
    expect(row).not.toBeNull();
    const parsed = JSON.parse(row!.value) as ObservabilitySummaryEnvelope;
    expect(parsed.totalCalls).toBe(2);
    expect(parsed.totalInputTokens).toBe(100);
    expect(parsed.totalCostUsd).toBeCloseTo(0.001);
    expect(parsed.computedAt).toBe(NOW.toISOString());
    expect(parsed.windowStart).toBe(computeWindowStart(30, NOW));
    expect(parsed.windowEnd).toBe(NOW.toISOString());
  });

  it('overwrites the previous cached value on re-run', () => {
    seedAiUsage(db, { created_at: isoDaysAgo(1) });
    runSummary({ now: NOW });

    // Add more usage and re-run with a later "now".
    const later = new Date(NOW.getTime() + 60_000);
    seedAiUsage(db, { created_at: isoDaysAgo(1) });
    runSummary({ now: later });

    const row = getSettingOrNull(OBSERVABILITY_SUMMARY_SETTING_KEY);
    const parsed = JSON.parse(row!.value) as ObservabilitySummaryEnvelope;
    expect(parsed.totalCalls).toBe(2);
    expect(parsed.computedAt).toBe(later.toISOString());
  });

  it('writes a zeroed summary when there is no usage data', () => {
    const { summary } = runSummary({ now: NOW });
    expect(summary.totalCalls).toBe(0);
    expect(summary.byProvider).toEqual([]);
    expect(summary.byModel).toEqual([]);

    const row = getSettingOrNull(OBSERVABILITY_SUMMARY_SETTING_KEY);
    expect(row).not.toBeNull();
    const parsed = JSON.parse(row!.value) as ObservabilitySummaryEnvelope;
    expect(parsed.totalCalls).toBe(0);
    expect(parsed.cacheHitRate).toBe(0);
    expect(parsed.errorRate).toBe(0);
  });
});
