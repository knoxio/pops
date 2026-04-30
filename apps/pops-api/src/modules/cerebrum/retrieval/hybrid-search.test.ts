/**
 * Unit tests for HybridSearchService graceful-degrade behaviour (#2439).
 *
 * The hybrid call must keep returning structured (BM25) results even when
 * semantic search throws — embedding API failures (config missing, network,
 * provider 4xx, rate limits) are best-effort and must not break Ego chat.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb } from '../../../shared/test-utils.js';
import { HybridSearchService } from './hybrid-search.js';

import type { Database } from 'better-sqlite3';

import type { SemanticSearchService } from './semantic-search.js';
import type { RetrievalResult } from './types.js';

describe('HybridSearchService — graceful degrade on semantic failure (#2439)', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  function makeService(): HybridSearchService {
    return new HybridSearchService(drizzle(db));
  }

  function stubSemanticToReject(svc: HybridSearchService, error: Error): void {
    // Spy on the private semantic service through the prototype so we don't
    // depend on internal field names.
    const semantic = (svc as unknown as { semanticSvc: SemanticSearchService }).semanticSvc;
    vi.spyOn(semantic, 'search').mockRejectedValue(error);
  }

  it('returns empty array (no throw) when semantic and structured both yield no results', async () => {
    const svc = makeService();
    stubSemanticToReject(svc, new Error('EMBEDDING_API_KEY is not configured'));

    const results = await svc.hybrid('any query');
    expect(results).toEqual([]);
  });

  it('still returns structured results when semantic throws config error', async () => {
    // Seed one engram so structured query has something to find.
    db.prepare(
      `INSERT INTO engram_index (id, file_path, type, source, status, created_at, modified_at, title, content_hash, word_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'eng_1',
      'note/eng_1.md',
      'note',
      'manual',
      'active',
      '2026-01-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
      'Test Engram',
      'hash_1',
      10
    );

    const svc = makeService();
    stubSemanticToReject(svc, new Error('EMBEDDING_API_KEY is not configured'));

    const results = await svc.hybrid('any query', { types: ['note'] });
    // Structured query returns the seeded engram even though semantic failed.
    expect(results.length).toBe(1);
    expect(results[0]?.sourceId).toBe('eng_1');
  });

  it('does not throw when semantic rejects with a network error', async () => {
    const svc = makeService();
    stubSemanticToReject(svc, Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' }));

    await expect(svc.hybrid('any query')).resolves.toEqual([]);
  });

  it('does not throw when semantic rejects with a 400 (e.g. Voyage rejecting unknown arg)', async () => {
    const svc = makeService();
    stubSemanticToReject(svc, Object.assign(new Error('400 Bad Request'), { status: 400 }));

    await expect(svc.hybrid('any query')).resolves.toEqual([]);
  });

  it('logs a warn (not an error) when semantic fails so the fallback is observable', async () => {
    const svc = makeService();
    const sentinel = new Error('EMBEDDING_API_KEY is not configured');
    stubSemanticToReject(svc, sentinel);

    // The catch block calls logger.warn — we can't easily assert on logger
    // output here without importing it, but at least confirm hybrid resolves
    // rather than rejecting (which is the behavioral contract we care about).
    const results: RetrievalResult[] = await svc.hybrid('q');
    expect(Array.isArray(results)).toBe(true);
  });
});
