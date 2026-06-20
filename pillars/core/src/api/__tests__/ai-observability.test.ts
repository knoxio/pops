/**
 * Integration tests for the `ai-observability.*` REST surface
 * (`core.aiObservability.*`), driven through the real Express app via
 * supertest.
 *
 * Mirrors the legacy tRPC service coverage on the REST transport: stats
 * totals + breakdowns, history grouping, latency percentiles + slow queries,
 * per-model quality metrics, and the filter query (provider scoping). All
 * usage is seeded into `ai_inference_log`.
 *
 * Auth gating is intentionally NOT asserted: REST runs under docker-net trust
 * (non-identity domain), so there is no `ctx.user` to bounce on.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  aiUsageService,
  openCoreDb,
  type CreateInferenceLogInput,
  type OpenedCoreDb,
} from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-ai-observability-rest-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' })
  );
}

function seedUsage(overrides: Partial<CreateInferenceLogInput> = {}): void {
  aiUsageService.createInferenceLog(coreDb.db, {
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

describe('ai-observability — getStats', () => {
  it('returns zeros and empty breakdowns when no data exists', async () => {
    const result = await client().aiObservability.getStats();
    expect(result.totalCalls).toBe(0);
    expect(result.totalCostUsd).toBe(0);
    expect(result.byProvider).toEqual([]);
    expect(result.byModel).toEqual([]);
    expect(result.byDomain).toEqual([]);
    expect(result.byOperation).toEqual([]);
  });

  it('totals tokens / cost and builds per-provider breakdowns', async () => {
    seedUsage({ provider: 'claude', inputTokens: 100, outputTokens: 20, costUsd: 0.001 });
    seedUsage({ provider: 'ollama', inputTokens: 200, outputTokens: 40, costUsd: 0.002 });

    const result = await client().aiObservability.getStats();
    expect(result.totalCalls).toBe(2);
    expect(result.totalInputTokens).toBe(300);
    expect(result.totalCostUsd).toBeCloseTo(0.003);
    expect(result.byProvider.map((b) => b.key).toSorted()).toEqual(['claude', 'ollama']);
  });

  it('honours the provider filter', async () => {
    seedUsage({ provider: 'claude', costUsd: 0.001 });
    seedUsage({ provider: 'ollama', costUsd: 0.002 });

    const result = await client().aiObservability.getStats({ provider: 'claude' });
    expect(result.totalCalls).toBe(1);
    expect(result.byProvider).toHaveLength(1);
    expect(result.byProvider[0]?.key).toBe('claude');
  });
});

describe('ai-observability — getHistory', () => {
  it('groups records by date with a summary', async () => {
    seedUsage({ costUsd: 0.001, createdAt: '2026-03-10T10:00:00.000Z' });
    seedUsage({ costUsd: 0.002, createdAt: '2026-03-10T12:00:00.000Z' });

    const result = await client().aiObservability.getHistory();
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.date).toBe('2026-03-10');
    expect(result.records[0]?.calls).toBe(2);
    expect(result.summary.totalCostUsd).toBeCloseTo(0.003);
  });
});

describe('ai-observability — getLatencyStats', () => {
  it('reports percentiles and surfaces slow queries', async () => {
    seedUsage({ latencyMs: 100 });
    seedUsage({ latencyMs: 500 });
    seedUsage({ latencyMs: 2000 });

    const result = await client().aiObservability.getLatencyStats();
    expect(result.p50).toBeGreaterThanOrEqual(0);
    expect(result.p99).toBeGreaterThanOrEqual(result.p50);
    expect(Array.isArray(result.slowQueries)).toBe(true);
  });
});

describe('ai-observability — getQualityMetrics', () => {
  it('returns per-model quality metrics', async () => {
    seedUsage({ model: 'claude-haiku-4-5-20251001', status: 'success' });
    seedUsage({ model: 'claude-haiku-4-5-20251001', status: 'error' });

    const result = await client().aiObservability.getQualityMetrics();
    expect(result.byModel.length).toBeGreaterThan(0);
    const model = result.byModel.find((m) => m.model === 'claude-haiku-4-5-20251001');
    expect(model).toBeDefined();
    expect(model?.errorRate).toBeGreaterThan(0);
  });

  it('returns an empty byModel array when no data exists', async () => {
    const result = await client().aiObservability.getQualityMetrics();
    expect(result.byModel).toEqual([]);
  });
});
