/**
 * Integration tests for the `ai-usage.*` REST surface, driven through the real
 * Express app via supertest: stats aggregation (zeros, single entry,
 * cache-hit-rate over the inference log's `cached` column) and date-range
 * history filtering. The AI-entity disk cache surface is owned by the finance
 * pillar, so its stats/prune/clear endpoints are not part of the ai pillar's
 * telemetry slice.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiUsageService, openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let aiDb: OpenedAiDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-ai-usage-rest-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createAiApiApp({ aiDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3008' })
  );
}

function seedUsage(overrides: {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  cached?: number;
  createdAt?: string;
}): void {
  aiUsageService.createInferenceLog(aiDb.db, {
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

describe('ai-usage — getStats', () => {
  it('returns zeros when no usage data exists', async () => {
    const result = await client().aiUsage.getStats();
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
    seedUsage({ inputTokens: 150, outputTokens: 25, costUsd: 0.003, cached: 0 });

    const result = await client().aiUsage.getStats();
    expect(result.totalCost).toBeCloseTo(0.003);
    expect(result.totalApiCalls).toBe(1);
    expect(result.totalInputTokens).toBe(150);
    expect(result.totalOutputTokens).toBe(25);
    expect(result.last30Days).toBeDefined();
    expect(result.last30Days!.apiCalls).toBe(1);
  });

  it('calculates cache hit rate correctly', async () => {
    seedUsage({ cached: 0, costUsd: 0.002 });
    seedUsage({ cached: 0, costUsd: 0.003 });
    seedUsage({ cached: 1, costUsd: 0.0001 });

    const result = await client().aiUsage.getStats();
    expect(result.totalApiCalls).toBe(2);
    expect(result.totalCacheHits).toBe(1);
    expect(result.cacheHitRate).toBeCloseTo(1 / 3);
    expect(result.totalCost).toBeCloseTo(0.005);
    expect(result.avgCostPerCall).toBeCloseTo(0.0025);
  });
});

describe('ai-usage — getHistory', () => {
  it('returns empty records when no data exists', async () => {
    const result = await client().aiUsage.getHistory();
    expect(result.records).toEqual([]);
    expect(result.summary).toMatchObject({ totalCost: 0, totalApiCalls: 0, totalCacheHits: 0 });
  });

  it('returns correct shape for a single entry', async () => {
    seedUsage({
      inputTokens: 200,
      outputTokens: 30,
      costUsd: 0.005,
      createdAt: '2026-03-15T10:00:00.000Z',
    });

    const result = await client().aiUsage.getHistory();
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
  });

  it('filters by inclusive date range', async () => {
    seedUsage({ costUsd: 0.001, createdAt: '2026-03-01T10:00:00.000Z' });
    seedUsage({ costUsd: 0.002, createdAt: '2026-03-10T10:00:00.000Z' });
    seedUsage({ costUsd: 0.003, createdAt: '2026-03-20T10:00:00.000Z' });

    const result = await client().aiUsage.getHistory({
      startDate: '2026-03-05',
      endDate: '2026-03-15',
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.date).toBe('2026-03-10');
    expect(result.summary.totalCost).toBeCloseTo(0.002);
  });
});
