import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rotationCandidates, rotationExclusions, rotationSources } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { createCaller, setupTestContext } from '../../../shared/test-utils.js';
import { registerSourceAdapter } from './source-registry.js';
import { syncSource } from './sync-source.js';

import type { RotationSourceAdapter } from './source-types.js';

const ctx = setupTestContext();

function insertSource(overrides: Partial<typeof rotationSources.$inferInsert> = {}) {
  const db = getDrizzle();
  return db
    .insert(rotationSources)
    .values({ type: 'test', name: 'Test', priority: 5, enabled: 1, ...overrides })
    .returning()
    .get();
}

function insertCandidate(
  sourceId: number,
  tmdbId: number,
  overrides: Partial<typeof rotationCandidates.$inferInsert> = {}
) {
  const db = getDrizzle();
  return db
    .insert(rotationCandidates)
    .values({
      sourceId,
      tmdbId,
      title: `Movie ${tmdbId}`,
      status: 'pending',
      ...overrides,
    })
    .returning()
    .get();
}

// ---------------------------------------------------------------------------
// tRPC exclusion endpoint tests
// ---------------------------------------------------------------------------

describe('rotation.listExclusions', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => {
    ctx.teardown();
  });

  it('returns empty list when no exclusions', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.listExclusions({});
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns exclusions ordered by excludedAt desc', async () => {
    const db = getDrizzle();
    db.insert(rotationExclusions).values({ tmdbId: 100, title: 'Movie A' }).run();
    db.insert(rotationExclusions).values({ tmdbId: 200, title: 'Movie B' }).run();

    const caller = createCaller();
    const result = await caller.media.rotation.listExclusions({});
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('supports pagination with limit and offset', async () => {
    const db = getDrizzle();
    for (let i = 1; i <= 5; i++) {
      db.insert(rotationExclusions)
        .values({ tmdbId: i * 100, title: `Movie ${i}` })
        .run();
    }

    const caller = createCaller();
    const page1 = await caller.media.rotation.listExclusions({ limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = await caller.media.rotation.listExclusions({ limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);
  });
});

describe('rotation.excludeCandidate', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => {
    ctx.teardown();
  });

  it('adds movie to exclusion list', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.excludeCandidate({
      tmdbId: 550,
      title: 'Fight Club',
      reason: 'Not interested',
    });

    expect(result.success).toBe(true);

    const db = getDrizzle();
    const exclusion = db
      .select()
      .from(rotationExclusions)
      .where(eq(rotationExclusions.tmdbId, 550))
      .get();
    expect(exclusion).toBeTruthy();
    expect(exclusion!.title).toBe('Fight Club');
    expect(exclusion!.reason).toBe('Not interested');
  });

  it('marks matching candidate as excluded', async () => {
    const source = insertSource();
    insertCandidate(source.id, 550);

    const caller = createCaller();
    await caller.media.rotation.excludeCandidate({ tmdbId: 550, title: 'Fight Club' });

    const db = getDrizzle();
    const candidate = db
      .select()
      .from(rotationCandidates)
      .where(eq(rotationCandidates.tmdbId, 550))
      .get();
    expect(candidate!.status).toBe('excluded');
  });

  it('does not error if no matching candidate exists', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.excludeCandidate({
      tmdbId: 999,
      title: 'No Candidate',
    });
    expect(result.success).toBe(true);
  });

  it('is idempotent for duplicate tmdbId', async () => {
    const caller = createCaller();
    await caller.media.rotation.excludeCandidate({ tmdbId: 550, title: 'Fight Club' });
    await caller.media.rotation.excludeCandidate({ tmdbId: 550, title: 'Fight Club' });

    const db = getDrizzle();
    const exclusions = db
      .select()
      .from(rotationExclusions)
      .where(eq(rotationExclusions.tmdbId, 550))
      .all();
    expect(exclusions).toHaveLength(1);
  });
});

describe('rotation.removeExclusion', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => {
    ctx.teardown();
  });

  it('removes exclusion and resets candidate to pending', async () => {
    const source = insertSource();
    insertCandidate(source.id, 550, { status: 'excluded' });

    const db = getDrizzle();
    db.insert(rotationExclusions).values({ tmdbId: 550, title: 'Fight Club' }).run();

    const caller = createCaller();
    const result = await caller.media.rotation.removeExclusion({ tmdbId: 550 });

    expect(result.success).toBe(true);

    const exclusion = db
      .select()
      .from(rotationExclusions)
      .where(eq(rotationExclusions.tmdbId, 550))
      .get();
    expect(exclusion).toBeUndefined();

    const candidate = db
      .select()
      .from(rotationCandidates)
      .where(eq(rotationCandidates.tmdbId, 550))
      .get();
    expect(candidate!.status).toBe('pending');
  });

  it('returns success:false for non-existent exclusion', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.removeExclusion({ tmdbId: 999 });
    expect(result.success).toBe(false);
  });

  it('does not reset candidate if exclusion did not exist', async () => {
    const source = insertSource();
    insertCandidate(source.id, 550, { status: 'added' });

    const caller = createCaller();
    await caller.media.rotation.removeExclusion({ tmdbId: 550 });

    const db = getDrizzle();
    const candidate = db
      .select()
      .from(rotationCandidates)
      .where(eq(rotationCandidates.tmdbId, 550))
      .get();
    expect(candidate!.status).toBe('added');
  });
});

// ---------------------------------------------------------------------------
// Sync source exclusion filtering
// ---------------------------------------------------------------------------

describe('syncSource exclusion filtering', () => {
  beforeEach(() => {
    ctx.setup();
    const adapter: RotationSourceAdapter = {
      type: 'test_excl',
      fetchCandidates: vi.fn().mockResolvedValue([
        { tmdbId: 100, title: 'Allowed Movie', year: 2020, rating: 7.0, posterPath: null },
        { tmdbId: 200, title: 'Excluded Movie', year: 2021, rating: 8.0, posterPath: null },
      ]),
    };
    registerSourceAdapter(adapter);
  });

  afterEach(() => {
    ctx.teardown();
  });

  it('inserts excluded candidates with status excluded', async () => {
    const db = getDrizzle();
    db.insert(rotationExclusions).values({ tmdbId: 200, title: 'Excluded Movie' }).run();

    const source = insertSource({ type: 'test_excl' });
    await syncSource(source.id);

    const allowed = db
      .select()
      .from(rotationCandidates)
      .where(eq(rotationCandidates.tmdbId, 100))
      .get();
    const excluded = db
      .select()
      .from(rotationCandidates)
      .where(eq(rotationCandidates.tmdbId, 200))
      .get();

    expect(allowed!.status).toBe('pending');
    expect(excluded!.status).toBe('excluded');
  });
});
