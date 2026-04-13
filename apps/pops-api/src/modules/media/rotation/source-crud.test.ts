import { rotationCandidates, rotationSources } from '@pops/db-types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDrizzle } from '../../../db.js';
import { createCaller, setupTestContext } from '../../../shared/test-utils.js';

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
// listSources
// ---------------------------------------------------------------------------

describe('rotation.listSources', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => ctx.teardown());

  it('returns empty list when no sources', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.listSources();
    expect(result).toEqual([]);
  });

  it('returns sources ordered by priority descending', async () => {
    insertSource({ name: 'Low', priority: 2 });
    insertSource({ name: 'High', priority: 9 });
    insertSource({ name: 'Mid', priority: 5 });

    const caller = createCaller();
    const result = await caller.media.rotation.listSources();

    expect(result).toHaveLength(3);
    expect(result[0]!.name).toBe('High');
    expect(result[1]!.name).toBe('Mid');
    expect(result[2]!.name).toBe('Low');
  });

  it('includes candidate count per source', async () => {
    const src = insertSource({ name: 'WithCandidates' });
    insertCandidate(src.id, 100);
    insertCandidate(src.id, 200);
    insertSource({ name: 'Empty' });

    const caller = createCaller();
    const result = await caller.media.rotation.listSources();

    const withCandidates = result.find((s) => s.name === 'WithCandidates');
    const empty = result.find((s) => s.name === 'Empty');
    expect(withCandidates?.candidateCount).toBe(2);
    expect(empty?.candidateCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createSource
// ---------------------------------------------------------------------------

describe('rotation.createSource', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => ctx.teardown());

  it('creates a source with defaults', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.createSource({
      type: 'plex_watchlist',
      name: 'My Watchlist',
    });

    expect(result.type).toBe('plex_watchlist');
    expect(result.name).toBe('My Watchlist');
    expect(result.priority).toBe(5);
    expect(result.enabled).toBe(1);
    expect(result.syncIntervalHours).toBe(24);
  });

  it('creates a source with custom values', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.createSource({
      type: 'plex_friends',
      name: 'Friend List',
      priority: 8,
      enabled: false,
      config: { friendUuid: 'abc123' },
      syncIntervalHours: 12,
    });

    expect(result.name).toBe('Friend List');
    expect(result.priority).toBe(8);
    expect(result.enabled).toBe(0);
    expect(result.syncIntervalHours).toBe(12);
    expect(JSON.parse(result.config!)).toEqual({ friendUuid: 'abc123' });
  });
});

// ---------------------------------------------------------------------------
// updateSource
// ---------------------------------------------------------------------------

describe('rotation.updateSource', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => ctx.teardown());

  it('updates name and priority', async () => {
    const src = insertSource({ name: 'Old Name', priority: 3 });

    const caller = createCaller();
    const result = await caller.media.rotation.updateSource({
      id: src.id,
      name: 'New Name',
      priority: 9,
    });

    expect(result).toEqual({ success: true });

    const db = getDrizzle();
    const updated = db.select().from(rotationSources).where(eq(rotationSources.id, src.id)).get();
    expect(updated?.name).toBe('New Name');
    expect(updated?.priority).toBe(9);
  });

  it('toggles enabled status', async () => {
    const src = insertSource({ enabled: 1 });

    const caller = createCaller();
    await caller.media.rotation.updateSource({ id: src.id, enabled: false });

    const db = getDrizzle();
    const updated = db.select().from(rotationSources).where(eq(rotationSources.id, src.id)).get();
    expect(updated?.enabled).toBe(0);
  });

  it('returns failure when no fields provided', async () => {
    const src = insertSource();

    const caller = createCaller();
    const result = await caller.media.rotation.updateSource({ id: src.id });

    expect(result).toEqual({ success: false, message: 'No fields to update' });
  });

  it('returns failure for nonexistent source', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.updateSource({ id: 99999, name: 'X' });

    expect(result).toEqual({ success: false });
  });
});

// ---------------------------------------------------------------------------
// deleteSource
// ---------------------------------------------------------------------------

describe('rotation.deleteSource', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => ctx.teardown());

  it('deletes source and its candidates', async () => {
    const src = insertSource({ type: 'plex_watchlist', name: 'Deletable' });
    insertCandidate(src.id, 100);
    insertCandidate(src.id, 200);

    const caller = createCaller();
    const result = await caller.media.rotation.deleteSource({ id: src.id });

    expect(result).toEqual({ success: true });

    const db = getDrizzle();
    const sources = db.select().from(rotationSources).all();
    expect(sources).toHaveLength(0);

    const candidates = db.select().from(rotationCandidates).all();
    expect(candidates).toHaveLength(0);
  });

  it('prevents deleting manual source', async () => {
    const src = insertSource({ type: 'manual', name: 'Manual Queue' });

    const caller = createCaller();
    const result = await caller.media.rotation.deleteSource({ id: src.id });

    expect(result).toEqual({ success: false, message: 'Cannot delete the manual source' });

    const db = getDrizzle();
    const sources = db.select().from(rotationSources).all();
    expect(sources).toHaveLength(1);
  });

  it('returns failure for nonexistent source', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.deleteSource({ id: 99999 });

    expect(result).toEqual({ success: false, message: 'Source not found' });
  });
});
