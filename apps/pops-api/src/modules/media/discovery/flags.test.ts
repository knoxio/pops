import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMediaDb = { __mediaDb: true };

vi.mock('../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('../../../db/media-db-handle.js', () => ({
  getMediaDrizzle: vi.fn(() => mockMediaDb),
}));

vi.mock('@pops/media-db', () => ({
  movies: { id: 'id', tmdbId: 'tmdb_id' },
  watchHistory: { mediaId: 'media_id', mediaType: 'media_type' },
  mediaWatchlist: { mediaId: 'media_id', mediaType: 'media_type' },
  dismissedDiscoverService: {
    getDismissedTmdbIdSet: vi.fn(),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

import { dismissedDiscoverService } from '@pops/media-db';

import { getDrizzle } from '../../../db.js';
import { getMediaDrizzle } from '../../../db/media-db-handle.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from './flags.js';

const mockGetDrizzle = vi.mocked(getDrizzle);
const mockGetMediaDrizzle = vi.mocked(getMediaDrizzle);
const mockGetDismissedTmdbIdSet = vi.mocked(dismissedDiscoverService.getDismissedTmdbIdSet);

function createMockDb(rows: { tmdbId: number }[]) {
  const mockAll = vi.fn().mockReturnValue(rows);
  const mockWhere = vi.fn().mockReturnValue({ all: mockAll });
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere, all: mockAll });
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin, where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return { select: mockSelect } as unknown as ReturnType<typeof getDrizzle>;
}

describe('getWatchedTmdbIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty Set when no watch history', () => {
    mockGetDrizzle.mockReturnValue(createMockDb([]));
    const result = getWatchedTmdbIds();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('returns Set of watched TMDB IDs', () => {
    mockGetDrizzle.mockReturnValue(createMockDb([{ tmdbId: 100 }, { tmdbId: 200 }]));
    const result = getWatchedTmdbIds();
    expect(result.has(100)).toBe(true);
    expect(result.has(200)).toBe(true);
    expect(result.has(999)).toBe(false);
  });

  it('deduplicates multiple watch entries for same movie', () => {
    // Same TMDB ID watched twice
    mockGetDrizzle.mockReturnValue(createMockDb([{ tmdbId: 100 }, { tmdbId: 100 }]));
    const result = getWatchedTmdbIds();
    expect(result.size).toBe(1);
    expect(result.has(100)).toBe(true);
  });
});

describe('getWatchlistTmdbIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty Set when watchlist is empty', () => {
    mockGetDrizzle.mockReturnValue(createMockDb([]));
    const result = getWatchlistTmdbIds();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('returns Set of watchlisted TMDB IDs', () => {
    mockGetDrizzle.mockReturnValue(createMockDb([{ tmdbId: 300 }, { tmdbId: 400 }]));
    const result = getWatchlistTmdbIds();
    expect(result.has(300)).toBe(true);
    expect(result.has(400)).toBe(true);
    expect(result.has(999)).toBe(false);
  });
});

describe('getDismissedTmdbIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty Set when no dismissed movies', () => {
    mockGetDismissedTmdbIdSet.mockReturnValue(new Set());
    const result = getDismissedTmdbIds();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('returns Set of dismissed TMDB IDs from dismissedDiscoverService', () => {
    mockGetDismissedTmdbIdSet.mockReturnValue(new Set([500, 600]));
    const result = getDismissedTmdbIds();
    expect(result.has(500)).toBe(true);
    expect(result.has(600)).toBe(true);
    expect(result.has(999)).toBe(false);
  });

  it('resolves the media-pillar drizzle handle and forwards it to the service', () => {
    mockGetDismissedTmdbIdSet.mockReturnValue(new Set([42]));
    getDismissedTmdbIds();
    expect(mockGetMediaDrizzle).toHaveBeenCalledTimes(1);
    expect(mockGetDismissedTmdbIdSet).toHaveBeenCalledWith(mockMediaDb);
    expect(mockGetDrizzle).not.toHaveBeenCalled();
  });
});
