/**
 * Tests for standalone Plex watch history sync.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlexClient } from './client.js';
import type { PlexEpisode, PlexMediaItem } from './types.js';

// Mock dependencies
vi.mock('../movies/service.js', () => ({
  getMovieByTmdbId: vi.fn(),
}));

vi.mock('../tv-shows/service.js', () => ({
  getTvShowByTvdbId: vi.fn(),
}));

vi.mock('../watch-history/service.js', () => ({
  logWatch: vi.fn(),
}));

vi.mock('../../../db.js', () => ({
  getDb: vi.fn(),
  getDrizzle: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  episodes: { seasonId: 'seasonId', episodeNumber: 'episodeNumber', id: 'id' },
  seasons: { tvShowId: 'tvShowId', seasonNumber: 'seasonNumber', id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

import { getDb, getDrizzle } from '../../../db.js';
import { getMovieByTmdbId } from '../movies/service.js';
import { getTvShowByTvdbId } from '../tv-shows/service.js';
import { logWatch } from '../watch-history/service.js';
import { syncWatchHistoryFromPlex } from './sync-watch-history.js';

const mockGetMovieByTmdbId = vi.mocked(getMovieByTmdbId);
const mockGetTvShowByTvdbId = vi.mocked(getTvShowByTvdbId);
const mockLogWatch = vi.mocked(logWatch);
const mockGetDb = vi.mocked(getDb);
const mockGetDrizzle = vi.mocked(getDrizzle);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlexMovie(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: '1',
    type: 'movie',
    title: 'Test Movie',
    originalTitle: null,
    summary: null,
    tagline: null,
    year: 2024,
    thumbUrl: null,
    artUrl: null,
    durationMs: 7200000,
    addedAt: 1700000000,
    updatedAt: 1700000000,
    lastViewedAt: 1711500000,
    viewCount: 1,
    rating: null,
    audienceRating: null,
    contentRating: null,
    externalIds: [{ source: 'tmdb', id: '550' }],
    genres: [],
    directors: [],
    leafCount: null,
    viewedLeafCount: null,
    childCount: null,
    ...overrides,
  };
}

function makePlexShow(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: '10',
    type: 'show',
    title: 'Test Show',
    originalTitle: null,
    summary: null,
    tagline: null,
    year: 2020,
    thumbUrl: null,
    artUrl: null,
    durationMs: null,
    addedAt: 1700000000,
    updatedAt: 1700000000,
    lastViewedAt: null,
    viewCount: 0,
    rating: null,
    audienceRating: null,
    contentRating: null,
    externalIds: [{ source: 'tvdb', id: '81189' }],
    genres: [],
    directors: [],
    leafCount: 100,
    viewedLeafCount: 50,
    childCount: 5,
    ...overrides,
  };
}

function makePlexEpisode(overrides: Partial<PlexEpisode> = {}): PlexEpisode {
  return {
    ratingKey: '300',
    title: 'Pilot',
    episodeIndex: 1,
    seasonIndex: 1,
    summary: null,
    thumbUrl: null,
    durationMs: 3600000,
    addedAt: 1700000000,
    updatedAt: 1700000000,
    lastViewedAt: 1711400000,
    viewCount: 1,
    ...overrides,
  };
}

function makePlexClient(
  movieItems: PlexMediaItem[] = [],
  tvItems: PlexMediaItem[] = [],
  episodeMap: Record<string, PlexEpisode[]> = {}
): PlexClient {
  return {
    getAllItems: vi.fn().mockImplementation((sectionId: string) => {
      if (sectionId === 'movies') return Promise.resolve(movieItems);
      if (sectionId === 'tv') return Promise.resolve(tvItems);
      return Promise.resolve([]);
    }),
    getEpisodes: vi.fn().mockImplementation((ratingKey: string) => {
      return Promise.resolve(episodeMap[ratingKey] ?? []);
    }),
  } as unknown as PlexClient;
}

function setupTransactionMock(): void {
  mockGetDb.mockReturnValue({
    transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => {
      return () => fn(null);
    }),
  } as unknown as ReturnType<typeof getDb>);
}

function setupDrizzleMock(seasonResult?: unknown, episodeResult?: unknown): void {
  let callCount = 0;
  const results = [seasonResult, episodeResult];
  const mockSelect = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockImplementation(() => results[callCount++]),
      }),
    }),
  }));
  mockGetDrizzle.mockReturnValue({ select: mockSelect } as unknown as ReturnType<
    typeof getDrizzle
  >);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  setupTransactionMock();
});

describe('syncWatchHistoryFromPlex', () => {
  describe('movies', () => {
    it('logs watch for a watched movie that exists locally', async () => {
      mockGetMovieByTmdbId.mockReturnValue({ id: 42 } as ReturnType<typeof getMovieByTmdbId>);
      mockLogWatch.mockReturnValue({
        entry: { id: 1 },
        created: true,
        watchlistRemoved: false,
      } as unknown as ReturnType<typeof logWatch>);

      const client = makePlexClient([makePlexMovie()]);
      const result = await syncWatchHistoryFromPlex(client, 'movies');

      expect(result.movies).not.toBeNull();
      expect(result.movies!.watched).toBe(1);
      expect(result.movies!.logged).toBe(1);
      expect(result.summary.moviesLogged).toBe(1);
    });

    it('counts movies with no local match', async () => {
      mockGetMovieByTmdbId.mockReturnValue(null);

      const client = makePlexClient([makePlexMovie()]);
      const result = await syncWatchHistoryFromPlex(client, 'movies');

      expect(result.movies!.noLocalMatch).toBe(1);
      expect(result.movies!.logged).toBe(0);
    });

    it('skips unwatched movies', async () => {
      const client = makePlexClient([makePlexMovie({ viewCount: 0, lastViewedAt: null })]);
      const result = await syncWatchHistoryFromPlex(client, 'movies');

      expect(result.movies!.watched).toBe(0);
      expect(result.movies!.logged).toBe(0);
    });

    it('returns null for movies when no movieSectionId provided', async () => {
      const client = makePlexClient();
      const result = await syncWatchHistoryFromPlex(client, undefined, 'tv');

      expect(result.movies).toBeNull();
    });
  });

  describe('TV shows', () => {
    it('syncs episode watches for a show with TVDB ID', async () => {
      mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as ReturnType<typeof getTvShowByTvdbId>);
      setupDrizzleMock({ id: 10 }, { id: 100 });
      mockLogWatch.mockReturnValue({
        entry: { id: 1 },
        created: true,
        watchlistRemoved: false,
      } as unknown as ReturnType<typeof logWatch>);

      const ep = makePlexEpisode({ viewCount: 1 });
      const client = makePlexClient([], [makePlexShow()], { '10': [ep] });
      const result = await syncWatchHistoryFromPlex(client, undefined, 'tv');

      expect(result.shows).toHaveLength(1);
      const show = result.shows[0];
      expect(show).toBeDefined();
      expect(show?.title).toBe('Test Show');
      expect(show?.diagnostics.matched).toBe(1);
      expect(result.summary.episodesLogged).toBe(1);
    });

    it('skips shows without TVDB ID', async () => {
      const show = makePlexShow({ externalIds: [] });
      const client = makePlexClient([], [show]);
      const result = await syncWatchHistoryFromPlex(client, undefined, 'tv');

      expect(result.shows).toHaveLength(0);
    });

    it('excludes shows with zero watched episodes from results', async () => {
      mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as ReturnType<typeof getTvShowByTvdbId>);
      setupDrizzleMock({ id: 10 }, { id: 100 });

      const ep = makePlexEpisode({ viewCount: 0 });
      const client = makePlexClient([], [makePlexShow()], { '10': [ep] });
      const result = await syncWatchHistoryFromPlex(client, undefined, 'tv');

      // Show had no watched episodes, so it's excluded
      expect(result.shows).toHaveLength(0);
    });

    it('detects shows with gaps (plexViewedLeafCount > tracked)', async () => {
      mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as ReturnType<typeof getTvShowByTvdbId>);
      // Season found but episode not found → gap
      setupDrizzleMock({ id: 10 }, undefined);

      const ep = makePlexEpisode({ viewCount: 1 });
      const show = makePlexShow({ viewedLeafCount: 50 });
      const client = makePlexClient([], [show], { '10': [ep] });
      const result = await syncWatchHistoryFromPlex(client, undefined, 'tv');

      expect(result.summary.showsWithGaps).toBe(1);
    });

    it('does not flag gap when episodes are already logged', async () => {
      mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as ReturnType<typeof getTvShowByTvdbId>);
      setupDrizzleMock({ id: 10 }, { id: 100 });
      // logWatch returns created: false → alreadyLogged
      mockLogWatch.mockReturnValue({
        entry: { id: 1 },
        created: false,
        watchlistRemoved: false,
      } as unknown as ReturnType<typeof logWatch>);

      const ep = makePlexEpisode({ viewCount: 1 });
      const show = makePlexShow({ viewedLeafCount: 1 });
      const client = makePlexClient([], [show], { '10': [ep] });
      const result = await syncWatchHistoryFromPlex(client, undefined, 'tv');

      // 0 matched + 1 alreadyLogged >= 1 viewedLeafCount → no gap
      expect(result.summary.showsWithGaps).toBe(0);
      expect(result.summary.episodesAlreadyLogged).toBe(1);
    });

    it('includes plexViewedLeafCount in show diagnostics', async () => {
      mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as ReturnType<typeof getTvShowByTvdbId>);
      setupDrizzleMock({ id: 10 }, { id: 100 });
      mockLogWatch.mockReturnValue({
        entry: { id: 1 },
        created: true,
        watchlistRemoved: false,
      } as unknown as ReturnType<typeof logWatch>);

      const ep = makePlexEpisode({ viewCount: 1 });
      const show = makePlexShow({ viewedLeafCount: 42 });
      const client = makePlexClient([], [show], { '10': [ep] });
      const result = await syncWatchHistoryFromPlex(client, undefined, 'tv');

      expect(result.shows[0]?.plexViewedLeafCount).toBe(42);
    });
  });

  describe('combined sync', () => {
    it('syncs both movies and TV when both section IDs provided', async () => {
      // Movie setup
      mockGetMovieByTmdbId.mockReturnValue({ id: 42 } as ReturnType<typeof getMovieByTmdbId>);
      mockLogWatch.mockReturnValue({
        entry: { id: 1 },
        created: true,
        watchlistRemoved: false,
      } as unknown as ReturnType<typeof logWatch>);

      // TV setup
      mockGetTvShowByTvdbId.mockReturnValue({ id: 1 } as ReturnType<typeof getTvShowByTvdbId>);
      setupDrizzleMock({ id: 10 }, { id: 100 });

      const ep = makePlexEpisode({ viewCount: 1 });
      const client = makePlexClient([makePlexMovie()], [makePlexShow()], { '10': [ep] });
      const result = await syncWatchHistoryFromPlex(client, 'movies', 'tv');

      expect(result.movies).not.toBeNull();
      expect(result.shows.length).toBeGreaterThanOrEqual(0);
      expect(result.summary.moviesLogged).toBe(1);
    });
  });
});
