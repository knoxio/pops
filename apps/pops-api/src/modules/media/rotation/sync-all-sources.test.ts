import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rotationCandidates, rotationSources } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { setupTestContext } from '../../../shared/test-utils.js';
import { registerSourceAdapter } from './source-registry.js';
import { syncAllSources } from './sync-source.js';

import type { RotationSourceAdapter } from './source-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAdapter(
  type: string,
  candidates: { tmdbId: number; title: string }[] = []
): RotationSourceAdapter {
  return {
    type,
    fetchCandidates: vi
      .fn()
      .mockResolvedValue(
        candidates.map((c) => ({ ...c, year: 2020, rating: 7.0, posterPath: null }))
      ),
  };
}

function insertSource(overrides: Partial<typeof rotationSources.$inferInsert> = {}) {
  const db = getDrizzle();
  return db
    .insert(rotationSources)
    .values({ type: 'mock_a', name: 'Test', priority: 5, enabled: 1, ...overrides })
    .returning()
    .get();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const ctx = setupTestContext();

describe('syncAllSources', () => {
  beforeEach(() => {
    ctx.setup();
    registerSourceAdapter(
      createMockAdapter('mock_a', [
        { tmdbId: 100, title: 'Movie A' },
        { tmdbId: 101, title: 'Movie B' },
      ])
    );
    registerSourceAdapter(createMockAdapter('mock_b', [{ tmdbId: 200, title: 'Movie C' }]));
  });

  afterEach(() => {
    ctx.teardown();
  });

  it('syncs all enabled sources with no lastSyncedAt', async () => {
    insertSource({ type: 'mock_a', name: 'Source A' });
    insertSource({ type: 'mock_b', name: 'Source B' });

    const result = await syncAllSources();

    expect(result.synced).toHaveLength(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const db = getDrizzle();
    const candidates = db.select().from(rotationCandidates).all();
    expect(candidates).toHaveLength(3);
  });

  it('skips disabled sources', async () => {
    insertSource({ type: 'mock_a', name: 'Enabled', enabled: 1 });
    insertSource({ type: 'mock_b', name: 'Disabled', enabled: 0 });

    const result = await syncAllSources();

    expect(result.synced).toHaveLength(1);
    expect(result.synced[0]!.sourceType).toBe('mock_a');
  });

  it('skips recently synced sources within interval', async () => {
    insertSource({
      type: 'mock_a',
      name: 'Recent',
      syncIntervalHours: 24,
      lastSyncedAt: new Date().toISOString(),
    });

    const result = await syncAllSources();

    expect(result.synced).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it('syncs sources past their interval', async () => {
    const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    insertSource({
      type: 'mock_a',
      name: 'Stale',
      syncIntervalHours: 24,
      lastSyncedAt: pastDate,
    });

    const result = await syncAllSources();

    expect(result.synced).toHaveLength(1);
  });

  it('handles per-source errors without blocking others', async () => {
    const failingAdapter: RotationSourceAdapter = {
      type: 'mock_fail',
      fetchCandidates: vi.fn().mockRejectedValue(new Error('API down')),
    };
    registerSourceAdapter(failingAdapter);

    insertSource({ type: 'mock_fail', name: 'Failing Source' });
    insertSource({ type: 'mock_a', name: 'Good Source' });

    const result = await syncAllSources();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toContain('API down');
    expect(result.synced).toHaveLength(1);
    expect(result.synced[0]!.sourceType).toBe('mock_a');
  });

  it('returns empty results when no sources configured', async () => {
    const result = await syncAllSources();

    expect(result.synced).toHaveLength(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('updates lastSyncedAt after successful sync', async () => {
    const source = insertSource({ type: 'mock_a', name: 'Trackable' });

    await syncAllSources();

    const db = getDrizzle();
    const updated = db
      .select()
      .from(rotationSources)
      .where(eq(rotationSources.id, source.id))
      .get();
    expect(updated!.lastSyncedAt).toBeTruthy();
  });
});
