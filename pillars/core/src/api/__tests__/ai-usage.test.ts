/**
 * Integration tests for the `ai-usage.*` REST surface (`core.aiUsage.*`),
 * driven through the real Express app via supertest.
 *
 * Mirrors the legacy tRPC coverage on the REST transport: stats aggregation
 * (zeros, single entry, cache-hit-rate), date-range history filtering, and
 * the cache-maintenance endpoints (stats / prune / clear-all). The on-disk
 * cache is isolated per-test via `AI_CACHE_PATH` and reset with `clearCache`,
 * so the prune/clear assertions don't bleed across runs.
 *
 * Auth gating is intentionally NOT asserted: REST runs under docker-net trust
 * (non-identity domain), so there is no `ctx.user` to bounce on.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiUsageService, openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { clearCache, setCachedEntry } from '../modules/ai-usage/cache.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let originalCachePath: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-ai-usage-rest-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  originalCachePath = process.env['AI_CACHE_PATH'];
  process.env['AI_CACHE_PATH'] = join(tmpDir, 'ai_entity_cache.json');
  clearCache();
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalCachePath === undefined) delete process.env['AI_CACHE_PATH'];
  else process.env['AI_CACHE_PATH'] = originalCachePath;
  clearCache();
});

function client() {
  return makeClient(
    createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' })
  );
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

describe('ai-usage — cache maintenance', () => {
  it('reports cache stats including disk size', async () => {
    setCachedEntry('SUPERMARKET CO', {
      description: 'Supermarket Co',
      entityName: 'Supermarket Co',
      category: 'groceries',
      cachedAt: new Date().toISOString(),
    });

    const stats = await client().aiUsage.cacheStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.diskSizeBytes).toBeGreaterThan(0);
  });

  it('prunes only entries older than maxAgeDays', async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date().toISOString();
    setCachedEntry('OLD VENDOR', {
      description: 'Old Vendor',
      entityName: 'Old Vendor',
      category: 'misc',
      cachedAt: old,
    });
    setCachedEntry('FRESH VENDOR', {
      description: 'Fresh Vendor',
      entityName: 'Fresh Vendor',
      category: 'misc',
      cachedAt: fresh,
    });

    const pruned = await client().aiUsage.clearStaleCache({ maxAgeDays: 30 });
    expect(pruned.removed).toBe(1);

    const stats = await client().aiUsage.cacheStats();
    expect(stats.totalEntries).toBe(1);
  });

  it('defaults the prune window to 30 days when maxAgeDays is omitted', async () => {
    setCachedEntry('ANCIENT VENDOR', {
      description: 'Ancient Vendor',
      entityName: 'Ancient Vendor',
      category: 'misc',
      cachedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const pruned = await client().aiUsage.clearStaleCache();
    expect(pruned.removed).toBe(1);
  });

  it('clears the entire cache and returns the removed count', async () => {
    setCachedEntry('A', {
      description: 'A',
      entityName: 'A',
      category: 'x',
      cachedAt: new Date().toISOString(),
    });
    setCachedEntry('B', {
      description: 'B',
      entityName: 'B',
      category: 'x',
      cachedAt: new Date().toISOString(),
    });

    const cleared = await client().aiUsage.clearAllCache();
    expect(cleared.removed).toBe(2);

    const stats = await client().aiUsage.cacheStats();
    expect(stats.totalEntries).toBe(0);
  });
});
