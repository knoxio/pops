/**
 * Integration tests for the `aiCache.*` REST surface, driven through the real
 * finance Express app via supertest.
 *
 * The finance-categorizer cache maintenance endpoints re-homed from core
 * (gap #3489). Covers cache stats, stale-prune (explicit + default window),
 * and clear-all. The on-disk cache is isolated per-test via `AI_CACHE_PATH`
 * and reset with `clearCache`, so the prune/clear assertions don't bleed
 * across runs.
 *
 * Auth gating is intentionally NOT asserted: REST runs under docker-net trust
 * (non-identity domain), so there is no `ctx.user` to bounce on.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { clearCache, setCachedEntry } from '../modules/ai-usage-cache.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;
let originalCachePath: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-ai-cache-rest-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  originalCachePath = process.env['AI_CACHE_PATH'];
  process.env['AI_CACHE_PATH'] = join(tmpDir, 'ai_entity_cache.json');
  clearCache();
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalCachePath === undefined) delete process.env['AI_CACHE_PATH'];
  else process.env['AI_CACHE_PATH'] = originalCachePath;
  clearCache();
});

function client() {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    })
  );
}

describe('ai-cache — finance-categorizer cache maintenance', () => {
  it('reports zero entries on an empty cache', async () => {
    const stats = await client().aiCache.cacheStats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.diskSizeBytes).toBe(0);
  });

  it('reports cache stats including disk size', async () => {
    setCachedEntry('SUPERMARKET CO', {
      description: 'Supermarket Co',
      entityName: 'Supermarket Co',
      category: 'groceries',
      cachedAt: new Date().toISOString(),
    });

    const stats = await client().aiCache.cacheStats();
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

    const pruned = await client().aiCache.clearStaleCache({ maxAgeDays: 30 });
    expect(pruned.removed).toBe(1);

    const stats = await client().aiCache.cacheStats();
    expect(stats.totalEntries).toBe(1);
  });

  it('defaults the prune window to 30 days when maxAgeDays is omitted', async () => {
    setCachedEntry('ANCIENT VENDOR', {
      description: 'Ancient Vendor',
      entityName: 'Ancient Vendor',
      category: 'misc',
      cachedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const pruned = await client().aiCache.clearStaleCache();
    expect(pruned.removed).toBe(1);
  });

  it('rejects a non-positive maxAgeDays with a 400', async () => {
    await expect(client().aiCache.clearStaleCache({ maxAgeDays: 0 })).rejects.toMatchObject({
      status: 400,
    });
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

    const cleared = await client().aiCache.clearAllCache();
    expect(cleared.removed).toBe(2);

    const stats = await client().aiCache.cacheStats();
    expect(stats.totalEntries).toBe(0);
  });
});
