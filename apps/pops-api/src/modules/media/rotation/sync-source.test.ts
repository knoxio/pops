import { rotationCandidates, rotationSources } from '@pops/db-types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDrizzle } from '../../../db.js';
import { setupTestContext } from '../../../shared/test-utils.js';
import { registerSourceAdapter } from './source-registry.js';
import type { CandidateMovie, RotationSourceAdapter } from './source-types.js';
import { syncSource } from './sync-source.js';

// ---------------------------------------------------------------------------
// Test adapter
// ---------------------------------------------------------------------------

function createMockAdapter(candidates: CandidateMovie[]): RotationSourceAdapter {
  return {
    type: 'test_source',
    fetchCandidates: vi.fn().mockResolvedValue(candidates),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestSource(overrides: Partial<typeof rotationSources.$inferInsert> = {}) {
  const db = getDrizzle();
  return db
    .insert(rotationSources)
    .values({
      type: 'test_source',
      name: 'Test Source',
      priority: 5,
      enabled: 1,
      ...overrides,
    })
    .returning()
    .get();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const ctx = setupTestContext();

describe('syncSource', () => {
  let adapter: RotationSourceAdapter;

  beforeEach(() => {
    ctx.setup();
    adapter = createMockAdapter([
      { tmdbId: 550, title: 'Fight Club', year: 1999, rating: 8.4, posterPath: '/poster1.jpg' },
      { tmdbId: 680, title: 'Pulp Fiction', year: 1994, rating: 8.9, posterPath: '/poster2.jpg' },
    ]);
    registerSourceAdapter(adapter);
  });

  afterEach(() => {
    ctx.teardown();
  });

  it('inserts candidates from the adapter', async () => {
    const source = createTestSource();
    const result = await syncSource(source.id);

    expect(result.candidatesFetched).toBe(2);
    expect(result.candidatesInserted).toBe(2);
    expect(result.candidatesSkipped).toBe(0);

    const db = getDrizzle();
    const rows = db.select().from(rotationCandidates).all();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.tmdbId).toBe(550);
    expect(rows[0]!.title).toBe('Fight Club');
    expect(rows[1]!.tmdbId).toBe(680);
  });

  it('skips duplicate tmdbIds on re-sync', async () => {
    const source = createTestSource();

    await syncSource(source.id);
    const result2 = await syncSource(source.id);

    expect(result2.candidatesFetched).toBe(2);
    expect(result2.candidatesInserted).toBe(0);
    expect(result2.candidatesSkipped).toBe(2);

    const db = getDrizzle();
    const rows = db.select().from(rotationCandidates).all();
    expect(rows).toHaveLength(2);
  });

  it('updates lastSyncedAt on the source', async () => {
    const source = createTestSource();
    expect(source.lastSyncedAt).toBeNull();

    await syncSource(source.id);

    const db = getDrizzle();
    const updated = db
      .select()
      .from(rotationSources)
      .where(eq(rotationSources.id, source.id))
      .get();
    expect(updated!.lastSyncedAt).toBeTruthy();
  });

  it('throws for non-existent source', async () => {
    await expect(syncSource(9999)).rejects.toThrow('not found');
  });

  it('throws for disabled source', async () => {
    const source = createTestSource({ enabled: 0 });
    await expect(syncSource(source.id)).rejects.toThrow('disabled');
  });

  it('throws for unknown source type', async () => {
    const source = createTestSource({ type: 'unknown_type' });
    await expect(syncSource(source.id)).rejects.toThrow('No adapter registered');
  });

  it('handles empty candidates', async () => {
    const emptyAdapter = createMockAdapter([]);
    registerSourceAdapter({ ...emptyAdapter, type: 'empty_source' });
    const source = createTestSource({ type: 'empty_source' });

    const result = await syncSource(source.id);

    expect(result.candidatesFetched).toBe(0);
    expect(result.candidatesInserted).toBe(0);
    expect(result.candidatesSkipped).toBe(0);
  });

  it('parses config JSON and passes to adapter', async () => {
    const source = createTestSource({ config: '{"key":"value"}' });

    await syncSource(source.id);

    expect(adapter.fetchCandidates).toHaveBeenCalledWith({ key: 'value' });
  });
});
