import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for listRotationLog, getRotationLogStats, and writeRotationLog behaviour.
 *
 * PRD-072 US-06
 */
import { rotationLog } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { createCaller, setupTestContext } from '../../../shared/test-utils.js';
import { _writeRotationLogForTest } from './scheduler.js';

const ctx = setupTestContext();

function insertLog(overrides: Partial<typeof rotationLog.$inferInsert> = {}) {
  const db = getDrizzle();
  return db
    .insert(rotationLog)
    .values({
      executedAt: new Date().toISOString(),
      moviesMarkedLeaving: 0,
      moviesRemoved: 0,
      moviesAdded: 0,
      removalsFailed: 0,
      freeSpaceGb: 100,
      targetFreeGb: 80,
      ...overrides,
    })
    .returning()
    .get();
}

// ---------------------------------------------------------------------------
// listRotationLog
// ---------------------------------------------------------------------------

describe('rotation.listRotationLog', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => {
    ctx.teardown();
  });

  it('returns empty list when no logs exist', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.listRotationLog({});
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns logs in newest-first order', async () => {
    insertLog({ executedAt: '2026-01-01T00:00:00Z', moviesAdded: 1 });
    insertLog({ executedAt: '2026-01-03T00:00:00Z', moviesAdded: 3 });
    insertLog({ executedAt: '2026-01-02T00:00:00Z', moviesAdded: 2 });

    const caller = createCaller();
    const result = await caller.media.rotation.listRotationLog({});
    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.items[0]!.moviesAdded).toBe(3);
    expect(result.items[1]!.moviesAdded).toBe(2);
    expect(result.items[2]!.moviesAdded).toBe(1);
  });

  it('paginates with offset and limit', async () => {
    for (let i = 0; i < 5; i++) {
      insertLog({ executedAt: `2026-01-0${i + 1}T00:00:00Z`, moviesAdded: i + 1 });
    }

    const caller = createCaller();
    const page1 = await caller.media.rotation.listRotationLog({ limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.items[0]!.moviesAdded).toBe(5); // newest first
    expect(page1.items[1]!.moviesAdded).toBe(4);

    const page2 = await caller.media.rotation.listRotationLog({ limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0]!.moviesAdded).toBe(3);

    const page3 = await caller.media.rotation.listRotationLog({ limit: 2, offset: 4 });
    expect(page3.items).toHaveLength(1);
  });

  it('includes skippedReason and details fields', async () => {
    const details = JSON.stringify({ removed: [{ tmdbId: 1, title: 'Test' }] });
    insertLog({ skippedReason: 'below target', details });

    const caller = createCaller();
    const result = await caller.media.rotation.listRotationLog({});
    expect(result.items[0]!.skippedReason).toBe('below target');
    expect(result.items[0]!.details).toBe(details);
  });
});

// ---------------------------------------------------------------------------
// getRotationLogStats
// ---------------------------------------------------------------------------

describe('rotation.getRotationLogStats', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => {
    ctx.teardown();
  });

  it('returns zeros when no logs exist', async () => {
    const caller = createCaller();
    const stats = await caller.media.rotation.getRotationLogStats();
    expect(stats.totalRotated).toBe(0);
    expect(stats.avgPerDay).toBe(0);
    expect(stats.streak).toBe(0);
  });

  it('sums removed + added across non-skipped cycles', async () => {
    insertLog({ moviesRemoved: 3, moviesAdded: 2 });
    insertLog({ moviesRemoved: 1, moviesAdded: 4 });
    insertLog({ moviesRemoved: 10, moviesAdded: 5, skippedReason: 'test skip' });

    const caller = createCaller();
    const stats = await caller.media.rotation.getRotationLogStats();
    // Only non-skipped: (3+2) + (1+4) = 10
    expect(stats.totalRotated).toBe(10);
  });

  it('calculates avg per day from date range of non-skipped cycles', async () => {
    // 10 days apart, 20 total rotated → 2.0/day
    insertLog({
      executedAt: '2026-01-01T00:00:00Z',
      moviesRemoved: 5,
      moviesAdded: 5,
    });
    insertLog({
      executedAt: '2026-01-11T00:00:00Z',
      moviesRemoved: 5,
      moviesAdded: 5,
    });

    const caller = createCaller();
    const stats = await caller.media.rotation.getRotationLogStats();
    expect(stats.totalRotated).toBe(20);
    expect(stats.avgPerDay).toBe(2);
  });

  it('returns avgPerDay based on total when single cycle exists', async () => {
    // Single cycle → days = max(1, 0) = 1
    insertLog({ moviesRemoved: 3, moviesAdded: 2 });

    const caller = createCaller();
    const stats = await caller.media.rotation.getRotationLogStats();
    expect(stats.totalRotated).toBe(5);
    expect(stats.avgPerDay).toBe(5); // 5 / 1 day
  });

  it('counts consecutive non-skipped cycles for streak', async () => {
    // Oldest to newest: skip, ok, ok, ok → streak = 3
    insertLog({ executedAt: '2026-01-01T00:00:00Z', skippedReason: 'old skip' });
    insertLog({ executedAt: '2026-01-02T00:00:00Z', moviesAdded: 1 });
    insertLog({ executedAt: '2026-01-03T00:00:00Z', moviesAdded: 1 });
    insertLog({ executedAt: '2026-01-04T00:00:00Z', moviesAdded: 1 });

    const caller = createCaller();
    const stats = await caller.media.rotation.getRotationLogStats();
    expect(stats.streak).toBe(3);
  });

  it('streak resets to zero when most recent cycle was skipped', async () => {
    insertLog({ executedAt: '2026-01-01T00:00:00Z', moviesAdded: 1 });
    insertLog({ executedAt: '2026-01-02T00:00:00Z', moviesAdded: 1 });
    insertLog({ executedAt: '2026-01-03T00:00:00Z', skippedReason: 'recent skip' });

    const caller = createCaller();
    const stats = await caller.media.rotation.getRotationLogStats();
    expect(stats.streak).toBe(0);
  });

  it('excludes skipped cycles from totalRotated even with large counts', async () => {
    insertLog({ moviesRemoved: 100, moviesAdded: 50, skippedReason: 'skip' });

    const caller = createCaller();
    const stats = await caller.media.rotation.getRotationLogStats();
    expect(stats.totalRotated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// writeRotationLog (via _writeRotationLogForTest)
// ---------------------------------------------------------------------------

describe('writeRotationLog', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => {
    ctx.teardown();
  });

  const baseResult = {
    moviesMarkedLeaving: 0,
    moviesRemoved: 0,
    moviesAdded: 0,
    removalsFailed: 0,
    freeSpaceGb: 100,
    targetFreeGb: 80,
    skippedReason: null,
    marked: [],
    removed: [],
    added: [],
    failed: [],
  };

  it('writes null details when all per-movie arrays are empty', async () => {
    _writeRotationLogForTest(baseResult);

    const caller = createCaller();
    const result = await caller.media.rotation.listRotationLog({});
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.details).toBeNull();
  });

  it('writes parseable JSON details when at least one array is non-empty', async () => {
    _writeRotationLogForTest({
      ...baseResult,
      moviesAdded: 1,
      added: [{ tmdbId: 42, title: 'Inception' }],
    });

    const caller = createCaller();
    const result = await caller.media.rotation.listRotationLog({});
    const details = result.items[0]!.details;
    expect(details).not.toBeNull();
    const parsed: unknown = JSON.parse(details!);
    expect(parsed).toMatchObject({
      marked: [],
      removed: [],
      added: [{ tmdbId: 42, title: 'Inception' }],
      failed: [],
    });
  });

  it('includes all four detail keys when multiple arrays are populated', async () => {
    _writeRotationLogForTest({
      ...baseResult,
      moviesMarkedLeaving: 1,
      moviesRemoved: 1,
      moviesAdded: 1,
      removalsFailed: 1,
      marked: [{ tmdbId: 1, title: 'A' }],
      removed: [{ tmdbId: 2, title: 'B' }],
      added: [{ tmdbId: 3, title: 'C' }],
      failed: [{ tmdbId: 4, title: 'D', error: 'timeout' }],
    });

    const caller = createCaller();
    const result = await caller.media.rotation.listRotationLog({});
    const parsed: unknown = JSON.parse(result.items[0]!.details!);
    expect(parsed).toMatchObject({
      marked: [{ tmdbId: 1, title: 'A' }],
      removed: [{ tmdbId: 2, title: 'B' }],
      added: [{ tmdbId: 3, title: 'C' }],
      failed: [{ tmdbId: 4, title: 'D' }],
    });
  });
});
