import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { rotationCandidates, rotationSources, settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { createCaller, setupTestContext } from '../../../shared/test-utils.js';

// Mock external services used by downloadCandidate
vi.mock('../arr/service.js', () => ({
  getRadarrClient: vi.fn(),
}));
vi.mock('../library/service.js', () => ({
  addMovie: vi.fn().mockResolvedValue({ movie: {}, created: true }),
}));
vi.mock('../tmdb/index.js', () => ({
  getTmdbClient: vi.fn().mockReturnValue({}),
  getImageCache: vi.fn().mockReturnValue({}),
}));

import { getRadarrClient } from '../arr/service.js';

const ctx = setupTestContext();

function insertSource(overrides: Partial<typeof rotationSources.$inferInsert> = {}) {
  const db = getDrizzle();
  return db
    .insert(rotationSources)
    .values({ type: 'test', name: 'Test Source', priority: 5, enabled: 1, ...overrides })
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

function insertSetting(key: string, value: string) {
  const db = getDrizzle();
  db.insert(settings).values({ key, value }).run();
}

// ---------------------------------------------------------------------------
// listCandidates
// ---------------------------------------------------------------------------

describe('rotation.listCandidates', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => {
    ctx.teardown();
  });

  it('returns empty list when no candidates', async () => {
    const caller = createCaller();
    const result = await caller.media.rotation.listCandidates();
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('filters by status', async () => {
    const src = insertSource();
    insertCandidate(src.id, 100, { status: 'pending' });
    insertCandidate(src.id, 200, { status: 'added' });
    insertCandidate(src.id, 300, { status: 'pending' });

    const caller = createCaller();
    const pending = await caller.media.rotation.listCandidates({ status: 'pending' });
    expect(pending.items).toHaveLength(2);
    expect(pending.total).toBe(2);

    const added = await caller.media.rotation.listCandidates({ status: 'added' });
    expect(added.items).toHaveLength(1);
    expect(added.total).toBe(1);
  });

  it('combines search with status filter', async () => {
    const src = insertSource();
    insertCandidate(src.id, 100, { title: 'The Matrix', status: 'pending' });
    insertCandidate(src.id, 200, { title: 'Matrix Reloaded', status: 'added' });
    insertCandidate(src.id, 300, { title: 'Inception', status: 'pending' });

    const caller = createCaller();
    const result = await caller.media.rotation.listCandidates({
      status: 'pending',
      search: 'Matrix',
    });

    // Should only return pending candidates matching search — not the added one
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe('The Matrix');
    expect(result.total).toBe(1);
  });

  it('total count respects search filter', async () => {
    const src = insertSource();
    for (let i = 1; i <= 25; i++) {
      insertCandidate(src.id, i, {
        title: i <= 5 ? `Alpha ${i}` : `Beta ${i}`,
        status: 'pending',
      });
    }

    const caller = createCaller();
    const result = await caller.media.rotation.listCandidates({
      status: 'pending',
      search: 'Alpha',
    });

    expect(result.items).toHaveLength(5);
    expect(result.total).toBe(5);
  });

  it('paginates correctly', async () => {
    const src = insertSource();
    for (let i = 1; i <= 5; i++) {
      insertCandidate(src.id, i, { title: `Movie ${i}` });
    }

    const caller = createCaller();
    const page1 = await caller.media.rotation.listCandidates({ limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = await caller.media.rotation.listCandidates({ limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);
  });

  it('includes source name and priority', async () => {
    const src = insertSource({ name: 'Letterboxd Top', priority: 8 });
    insertCandidate(src.id, 100);

    const caller = createCaller();
    const result = await caller.media.rotation.listCandidates();
    expect(result.items[0]!.sourceName).toBe('Letterboxd Top');
    expect(result.items[0]!.sourcePriority).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// downloadCandidate
// ---------------------------------------------------------------------------

describe('rotation.downloadCandidate', () => {
  beforeEach(() => ctx.setup());
  afterEach(() => {
    ctx.teardown();
    vi.mocked(getRadarrClient).mockReset();
  });

  it('throws NOT_FOUND for missing candidate', async () => {
    const caller = createCaller();
    await expect(caller.media.rotation.downloadCandidate({ candidateId: 999 })).rejects.toThrow(
      'Candidate not found'
    );
  });

  it('throws BAD_REQUEST for non-pending candidate', async () => {
    const src = insertSource();
    const c = insertCandidate(src.id, 100, { status: 'added' });

    const caller = createCaller();
    await expect(caller.media.rotation.downloadCandidate({ candidateId: c.id })).rejects.toThrow(
      'already added'
    );
  });

  it('throws PRECONDITION_FAILED when Radarr not configured', async () => {
    vi.mocked(getRadarrClient).mockReturnValue(null as any);
    const src = insertSource();
    const c = insertCandidate(src.id, 100);

    const caller = createCaller();
    await expect(caller.media.rotation.downloadCandidate({ candidateId: c.id })).rejects.toThrow(
      'Radarr not configured'
    );
  });

  it('throws PRECONDITION_FAILED when settings missing', async () => {
    vi.mocked(getRadarrClient).mockReturnValue({
      checkMovie: vi.fn(),
      addMovie: vi.fn(),
    } as any);
    const src = insertSource();
    const c = insertCandidate(src.id, 100);

    const caller = createCaller();
    await expect(caller.media.rotation.downloadCandidate({ candidateId: c.id })).rejects.toThrow(
      'quality profile or root folder not configured'
    );
  });

  it('marks as added when already in Radarr', async () => {
    vi.mocked(getRadarrClient).mockReturnValue({
      checkMovie: vi.fn().mockResolvedValue({ exists: true }),
      addMovie: vi.fn(),
    } as any);
    const src = insertSource();
    const c = insertCandidate(src.id, 100);
    insertSetting('rotation_quality_profile_id', '1');
    insertSetting('rotation_root_folder_path', '/movies');

    const caller = createCaller();
    const result = await caller.media.rotation.downloadCandidate({ candidateId: c.id });

    expect(result.alreadyInRadarr).toBe(true);
    // Candidate should be marked as added
    const db = getDrizzle();
    const updated = db
      .select()
      .from(rotationCandidates)
      .where(eq(rotationCandidates.id, c.id))
      .get();
    expect(updated!.status).toBe('added');
  });

  it('adds to Radarr and marks as added', async () => {
    const mockAddMovie = vi.fn().mockResolvedValue({});
    vi.mocked(getRadarrClient).mockReturnValue({
      checkMovie: vi.fn().mockResolvedValue({ exists: false }),
      addMovie: mockAddMovie,
    } as any);
    const src = insertSource();
    const c = insertCandidate(src.id, 100, { title: 'Test Movie', year: 2024 });
    insertSetting('rotation_quality_profile_id', '4');
    insertSetting('rotation_root_folder_path', '/movies');

    const caller = createCaller();
    const result = await caller.media.rotation.downloadCandidate({ candidateId: c.id });

    expect(result.alreadyInRadarr).toBe(false);
    expect(result.success).toBe(true);
    expect(mockAddMovie).toHaveBeenCalledWith(
      expect.objectContaining({
        tmdbId: 100,
        title: 'Test Movie',
        qualityProfileId: 4,
        rootFolderPath: '/movies',
      })
    );
  });
});
