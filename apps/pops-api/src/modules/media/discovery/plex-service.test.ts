import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlexMediaItem } from '../plex/types.js';

// Mock dependencies before imports
vi.mock('../plex/service.js', () => ({
  getPlexClient: vi.fn(),
}));

vi.mock('../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  movies: { tmdbId: 'tmdb_id' },
}));

vi.mock('./flags.js', () => ({
  getWatchedTmdbIds: vi.fn().mockReturnValue(new Set()),
  getWatchlistTmdbIds: vi.fn().mockReturnValue(new Set()),
}));

// Now import mocked modules
import { getDrizzle } from '../../../db.js';
import { getPlexClient } from '../plex/service.js';
import { getWatchedTmdbIds, getWatchlistTmdbIds } from './flags.js';
import { getTrendingFromPlex } from './plex-service.js';

const mockGetPlexClient = vi.mocked(getPlexClient);
const mockGetDrizzle = vi.mocked(getDrizzle);
const mockGetWatchedTmdbIds = vi.mocked(getWatchedTmdbIds);
const mockGetWatchlistTmdbIds = vi.mocked(getWatchlistTmdbIds);

/** Build a minimal PlexMediaItem for testing. */
function makePlexItem(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: '1',
    type: 'movie',
    title: 'Test Movie',
    originalTitle: null,
    summary: 'A test movie',
    tagline: null,
    year: 2025,
    thumbUrl: '/thumb/1',
    artUrl: null,
    durationMs: null,
    addedAt: 0,
    updatedAt: 0,
    lastViewedAt: null,
    viewCount: 0,
    rating: null,
    audienceRating: 7.5,
    contentRating: null,
    externalIds: [{ source: 'tmdb', id: '550' }],
    genres: ['Action'],
    directors: [],
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
    ...overrides,
  };
}

/** Create a mock DB that returns empty results for both queries. */
function createMockDb(libraryTmdbIds: number[] = []) {
  const mockAll = vi.fn().mockReturnValue(libraryTmdbIds.map((id) => ({ tmdbId: id })));
  const mockFrom = vi.fn().mockReturnValue({ all: mockAll });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  // For raw SQL query (dismissed_discover)
  const mockDbAll = vi.fn().mockReturnValue([]);

  return {
    select: mockSelect,
    all: mockDbAll,
  } as unknown as ReturnType<typeof getDrizzle>;
}

describe('getTrendingFromPlex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when Plex is not connected', async () => {
    mockGetPlexClient.mockReturnValue(null);

    const result = await getTrendingFromPlex();
    expect(result).toBeNull();
  });

  it('returns DiscoverResult[] when Plex is connected', async () => {
    const mockClient = {
      getTrending: vi.fn().mockResolvedValue([
        makePlexItem({
          ratingKey: '1',
          title: 'Movie A',
          externalIds: [{ source: 'tmdb', id: '100' }],
        }),
        makePlexItem({
          ratingKey: '2',
          title: 'Movie B',
          externalIds: [{ source: 'tmdb', id: '200' }],
        }),
      ]),
    };
    mockGetPlexClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof getPlexClient> & object
    );
    mockGetDrizzle.mockReturnValue(createMockDb());

    const result = await getTrendingFromPlex();
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0]!.tmdbId).toBe(100);
    expect(result![0]!.title).toBe('Movie A');
    expect(result![1]!.tmdbId).toBe(200);
  });

  it('excludes items without TMDB IDs', async () => {
    const mockClient = {
      getTrending: vi
        .fn()
        .mockResolvedValue([
          makePlexItem({ title: 'Has TMDB', externalIds: [{ source: 'tmdb', id: '100' }] }),
          makePlexItem({ title: 'No TMDB', externalIds: [{ source: 'imdb', id: 'tt1234' }] }),
          makePlexItem({ title: 'No IDs', externalIds: [] }),
        ]),
    };
    mockGetPlexClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof getPlexClient> & object
    );
    mockGetDrizzle.mockReturnValue(createMockDb());

    const result = await getTrendingFromPlex();
    expect(result).toHaveLength(1);
    expect(result![0]!.title).toBe('Has TMDB');
  });

  it('marks items as inLibrary when TMDB ID matches', async () => {
    const mockClient = {
      getTrending: vi
        .fn()
        .mockResolvedValue([
          makePlexItem({ title: 'In Library', externalIds: [{ source: 'tmdb', id: '100' }] }),
          makePlexItem({ title: 'Not In Library', externalIds: [{ source: 'tmdb', id: '200' }] }),
        ]),
    };
    mockGetPlexClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof getPlexClient> & object
    );
    mockGetDrizzle.mockReturnValue(createMockDb([100]));

    const result = await getTrendingFromPlex();
    expect(result![0]!.inLibrary).toBe(true);
    expect(result![0]!.posterUrl).toBe('/media/images/movie/100/poster.jpg');
    expect(result![1]!.inLibrary).toBe(false);
    expect(result![1]!.posterUrl).toBe('/thumb/1');
  });

  it('deduplicates by TMDB ID', async () => {
    const mockClient = {
      getTrending: vi.fn().mockResolvedValue([
        makePlexItem({
          ratingKey: '1',
          title: 'Movie A',
          externalIds: [{ source: 'tmdb', id: '100' }],
        }),
        makePlexItem({
          ratingKey: '2',
          title: 'Movie A Duplicate',
          externalIds: [{ source: 'tmdb', id: '100' }],
        }),
      ]),
    };
    mockGetPlexClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof getPlexClient> & object
    );
    mockGetDrizzle.mockReturnValue(createMockDb());

    const result = await getTrendingFromPlex();
    expect(result).toHaveLength(1);
    expect(result![0]!.title).toBe('Movie A');
  });

  it('excludes dismissed movies', async () => {
    const mockClient = {
      getTrending: vi
        .fn()
        .mockResolvedValue([
          makePlexItem({ title: 'Keep', externalIds: [{ source: 'tmdb', id: '100' }] }),
          makePlexItem({ title: 'Dismissed', externalIds: [{ source: 'tmdb', id: '200' }] }),
        ]),
    };
    mockGetPlexClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof getPlexClient> & object
    );

    const mockDb = createMockDb();
    // Override the raw SQL query to return dismissed IDs
    (mockDb.all as ReturnType<typeof vi.fn>).mockReturnValue([{ tmdb_id: 200 }]);
    mockGetDrizzle.mockReturnValue(mockDb);

    const result = await getTrendingFromPlex();
    expect(result).toHaveLength(1);
    expect(result![0]!.title).toBe('Keep');
  });

  it('respects limit parameter', async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makePlexItem({
        ratingKey: String(i),
        title: `Movie ${i}`,
        externalIds: [{ source: 'tmdb', id: String(i + 100) }],
      })
    );
    const mockClient = {
      getTrending: vi.fn().mockResolvedValue(items),
    };
    mockGetPlexClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof getPlexClient> & object
    );
    mockGetDrizzle.mockReturnValue(createMockDb());

    const result = await getTrendingFromPlex(3);
    expect(result).toHaveLength(3);
  });
});

describe('getTrendingFromPlex — isWatched + onWatchlist flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets isWatched=false and onWatchlist=false by default', async () => {
    const mockClient = {
      getTrending: vi
        .fn()
        .mockResolvedValue([makePlexItem({ externalIds: [{ source: 'tmdb', id: '100' }] })]),
    };
    mockGetPlexClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof getPlexClient> & object
    );
    mockGetDrizzle.mockReturnValue(createMockDb());
    mockGetWatchedTmdbIds.mockReturnValue(new Set());
    mockGetWatchlistTmdbIds.mockReturnValue(new Set());

    const result = await getTrendingFromPlex();
    expect(result![0]!.isWatched).toBe(false);
    expect(result![0]!.onWatchlist).toBe(false);
  });

  it('sets isWatched=true when tmdbId is in watch history', async () => {
    const mockClient = {
      getTrending: vi
        .fn()
        .mockResolvedValue([
          makePlexItem({ title: 'Watched', externalIds: [{ source: 'tmdb', id: '100' }] }),
          makePlexItem({ title: 'Unwatched', externalIds: [{ source: 'tmdb', id: '200' }] }),
        ]),
    };
    mockGetPlexClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof getPlexClient> & object
    );
    mockGetDrizzle.mockReturnValue(createMockDb());
    mockGetWatchedTmdbIds.mockReturnValue(new Set([100]));
    mockGetWatchlistTmdbIds.mockReturnValue(new Set());

    const result = await getTrendingFromPlex();
    const watched = result!.find((r) => r.tmdbId === 100);
    const unwatched = result!.find((r) => r.tmdbId === 200);
    expect(watched!.isWatched).toBe(true);
    expect(unwatched!.isWatched).toBe(false);
  });

  it('sets onWatchlist=true when tmdbId is on watchlist', async () => {
    const mockClient = {
      getTrending: vi
        .fn()
        .mockResolvedValue([
          makePlexItem({ title: 'On WL', externalIds: [{ source: 'tmdb', id: '300' }] }),
          makePlexItem({ title: 'Not on WL', externalIds: [{ source: 'tmdb', id: '400' }] }),
        ]),
    };
    mockGetPlexClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof getPlexClient> & object
    );
    mockGetDrizzle.mockReturnValue(createMockDb());
    mockGetWatchedTmdbIds.mockReturnValue(new Set());
    mockGetWatchlistTmdbIds.mockReturnValue(new Set([300]));

    const result = await getTrendingFromPlex();
    const onWl = result!.find((r) => r.tmdbId === 300);
    const notOnWl = result!.find((r) => r.tmdbId === 400);
    expect(onWl!.onWatchlist).toBe(true);
    expect(notOnWl!.onWatchlist).toBe(false);
  });
});
