/**
 * Tests for Plex TV show import — batch sync with episode watch matching.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlexClient } from './client.js';
import type { PlexEpisode, PlexMediaItem } from './types.js';

// Mock dependencies
vi.mock('../thetvdb/index.js', () => ({
  getTvdbClient: vi.fn(),
}));

vi.mock('../library/tv-show-service.js', () => ({
  addTvShow: vi.fn(),
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
import * as tvShowService from '../library/tv-show-service.js';
import { getTvdbClient } from '../thetvdb/index.js';
import { getTvShowByTvdbId } from '../tv-shows/service.js';
import { logWatch } from '../watch-history/service.js';
import { importTvShowsFromPlex } from './sync-tv.js';

const mockGetTvdbClient = vi.mocked(getTvdbClient);
const mockAddTvShow = vi.mocked(tvShowService.addTvShow);
const mockGetTvShowByTvdbId = vi.mocked(getTvShowByTvdbId);
const mockLogWatch = vi.mocked(logWatch);
const mockGetDb = vi.mocked(getDb);
const mockGetDrizzle = vi.mocked(getDrizzle);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlexShow(overrides: Partial<PlexMediaItem> = {}): PlexMediaItem {
  return {
    ratingKey: '200',
    type: 'show',
    title: 'Breaking Bad',
    originalTitle: 'Breaking Bad',
    summary: 'A chemistry teacher...',
    tagline: null,
    year: 2008,
    thumbUrl: null,
    artUrl: null,
    durationMs: null,
    addedAt: 1711000000,
    updatedAt: 1711000100,
    lastViewedAt: 1711500000,
    viewCount: 1,
    rating: 9.0,
    audienceRating: 9.5,
    contentRating: 'TV-MA',
    externalIds: [
      { source: 'tvdb', id: '81189' },
      { source: 'imdb', id: 'tt0903747' },
    ],
    genres: ['Drama', 'Crime'],
    directors: [],
    leafCount: 62,
    viewedLeafCount: 62,
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
    summary: 'Walter White begins...',
    thumbUrl: null,
    durationMs: 3480000,
    addedAt: 1711000000,
    updatedAt: 1711000100,
    lastViewedAt: 1711400000,
    viewCount: 1,
    ...overrides,
  };
}

function makePlexClient(
  items: PlexMediaItem[],
  episodeMap: Record<string, PlexEpisode[]> = {}
): PlexClient {
  return {
    getAllItems: vi.fn().mockResolvedValue(items),
    getEpisodes: vi.fn().mockImplementation((ratingKey: string) => {
      return Promise.resolve(episodeMap[ratingKey] ?? []);
    }),
  } as unknown as PlexClient;
}

function makeMockDb(seasonResult: unknown = undefined, episodeResult: unknown = undefined): void {
  const mockGet = vi.fn().mockReturnValueOnce(seasonResult).mockReturnValueOnce(episodeResult);
  const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  mockGetDrizzle.mockReturnValue({ select: mockSelect } as unknown as ReturnType<
    typeof getDrizzle
  >);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // getDb().transaction() wraps episode watch syncing
  mockGetDb.mockReturnValue({
    transaction: vi.fn((fn: () => unknown) => fn),
  } as unknown as BetterSqlite3.Database);
});

describe('importTvShowsFromPlex', () => {
  it('throws when TVDB client is not configured', async () => {
    mockGetTvdbClient.mockImplementation(() => {
      throw new Error('THETVDB_API_KEY is not configured');
    });
    const client = makePlexClient([]);

    await expect(importTvShowsFromPlex(client, '2')).rejects.toThrow('THETVDB_API_KEY');
    expect(client.getAllItems).not.toHaveBeenCalled();
  });

  it('syncs show using TVDB ID from Plex Guid', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);
    mockAddTvShow.mockResolvedValue({
      show: { id: 1, title: 'Breaking Bad' } as unknown as import('@pops/db-types').TvShowRow,
      seasons: [],
      created: true,
    });
    mockGetTvShowByTvdbId.mockReturnValue(null);

    const show = makePlexShow();
    const client = makePlexClient([show], { '200': [] });

    const result = await importTvShowsFromPlex(client, '2');

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockAddTvShow).toHaveBeenCalledWith(81189, fakeTvdbClient);
  });

  it('skips shows without TVDB ID and logs reason', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);

    const show = makePlexShow({
      externalIds: [{ source: 'imdb', id: 'tt0903747' }],
    });
    const client = makePlexClient([show]);

    const result = await importTvShowsFromPlex(client, '2');

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skipReasons).toHaveLength(1);
    expect(result.skipReasons[0]!.title).toBe('Breaking Bad');
    expect(result.skipReasons[0]!.reason).toBe('No TVDB ID in Plex metadata');
    expect(mockAddTvShow).not.toHaveBeenCalled();
  });

  it('skips shows with non-numeric TVDB ID and logs reason', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);

    const show = makePlexShow({
      externalIds: [{ source: 'tvdb', id: 'invalid' }],
    });
    const client = makePlexClient([show]);

    const result = await importTvShowsFromPlex(client, '2');

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skipReasons).toHaveLength(1);
    expect(result.skipReasons[0]!.reason).toBe('TVDB ID is not a valid number');
  });

  it('syncs episode watch history for watched episodes', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);
    mockAddTvShow.mockResolvedValue({
      show: { id: 1, title: 'Breaking Bad' } as unknown as import('@pops/db-types').TvShowRow,
      seasons: [],
      created: true,
    });
    mockGetTvShowByTvdbId.mockReturnValue({
      id: 1,
    } as unknown as import('@pops/db-types').TvShowRow);
    makeMockDb({ id: 10 }, { id: 100 });
    mockLogWatch.mockReturnValue({
      entry: { id: 1 },
      created: true,
      watchlistRemoved: false,
    } as unknown as ReturnType<typeof logWatch>);

    const ep = makePlexEpisode({ viewCount: 1, lastViewedAt: 1711400000 });
    const show = makePlexShow();
    const client = makePlexClient([show], { '200': [ep] });

    const result = await importTvShowsFromPlex(client, '2');

    expect(result.synced).toBe(1);
    expect(result.episodesMatched).toBe(1);
    expect(mockLogWatch).toHaveBeenCalledWith({
      mediaType: 'episode',
      mediaId: 100,
      watchedAt: expect.any(String),
      completed: 1,
      source: 'plex_sync',
    });
  });

  it('skips unwatched episodes', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);
    mockAddTvShow.mockResolvedValue({
      show: { id: 1, title: 'Breaking Bad' } as unknown as import('@pops/db-types').TvShowRow,
      seasons: [],
      created: true,
    });
    mockGetTvShowByTvdbId.mockReturnValue({
      id: 1,
    } as unknown as import('@pops/db-types').TvShowRow);

    const ep = makePlexEpisode({ viewCount: 0, lastViewedAt: null });
    const show = makePlexShow();
    const client = makePlexClient([show], { '200': [ep] });

    const result = await importTvShowsFromPlex(client, '2');

    expect(result.synced).toBe(1);
    expect(result.episodesMatched).toBe(0);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it('skips episodes when local season not found', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);
    mockAddTvShow.mockResolvedValue({
      show: { id: 1, title: 'Breaking Bad' } as unknown as import('@pops/db-types').TvShowRow,
      seasons: [],
      created: true,
    });
    mockGetTvShowByTvdbId.mockReturnValue({
      id: 1,
    } as unknown as import('@pops/db-types').TvShowRow);
    makeMockDb(undefined, undefined); // No season found

    const ep = makePlexEpisode({ viewCount: 1 });
    const show = makePlexShow();
    const client = makePlexClient([show], { '200': [ep] });

    const result = await importTvShowsFromPlex(client, '2');

    expect(result.episodesMatched).toBe(0);
    expect(mockLogWatch).not.toHaveBeenCalled();
  });

  it('records errors for failed shows without stopping sync', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);
    mockGetTvShowByTvdbId.mockReturnValue(null);

    const badShow = makePlexShow({ ratingKey: '1', title: 'Bad Show' });
    const goodShow = makePlexShow({ ratingKey: '2', title: 'Good Show' });

    mockAddTvShow.mockRejectedValueOnce(new Error('TVDB timeout')).mockResolvedValueOnce({
      show: { id: 2, title: 'Good Show' } as unknown as import('@pops/db-types').TvShowRow,
      seasons: [],
      created: true,
    });

    const client = makePlexClient([badShow, goodShow], { '2': [] });

    const result = await importTvShowsFromPlex(client, '2');

    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.title).toBe('Bad Show');
    expect(result.errors[0]!.reason).toContain('TVDB timeout');
    expect(result.processed).toBe(2);
  });

  it('calls onProgress callback after each show', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);
    mockAddTvShow.mockResolvedValue({
      show: { id: 1, title: 'Test' } as unknown as import('@pops/db-types').TvShowRow,
      seasons: [],
      created: true,
    });
    mockGetTvShowByTvdbId.mockReturnValue(null);

    const shows = [
      makePlexShow({ ratingKey: '1', title: 'Show 1' }),
      makePlexShow({ ratingKey: '2', title: 'Show 2' }),
    ];
    const client = makePlexClient(shows, { '1': [], '2': [] });
    const onProgress = vi.fn();

    await importTvShowsFromPlex(client, '2', { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    const finalProgress = onProgress.mock.calls[1]![0];
    expect(finalProgress.processed).toBe(2);
    expect(finalProgress.synced).toBe(2);
    expect(finalProgress.total).toBe(2);
  });

  it('handles empty library section', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);

    const client = makePlexClient([]);

    const result = await importTvShowsFromPlex(client, '2');

    expect(result.total).toBe(0);
    expect(result.processed).toBe(0);
    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.episodesMatched).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('ignores duplicate watch history errors', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);
    mockAddTvShow.mockResolvedValue({
      show: { id: 1, title: 'Breaking Bad' } as unknown as import('@pops/db-types').TvShowRow,
      seasons: [],
      created: true,
    });
    mockGetTvShowByTvdbId.mockReturnValue({
      id: 1,
    } as unknown as import('@pops/db-types').TvShowRow);
    makeMockDb({ id: 10 }, { id: 100 });
    mockLogWatch.mockImplementation(() => {
      throw new Error('UNIQUE constraint failed');
    });

    const ep = makePlexEpisode({ viewCount: 1, lastViewedAt: 1711400000 });
    const show = makePlexShow();
    const client = makePlexClient([show], { '200': [ep] });

    const result = await importTvShowsFromPlex(client, '2');

    // Should still count as synced despite watch history error
    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.skipReasons).toHaveLength(0);
  });

  it('handles multiple shows in batch', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);
    mockGetTvShowByTvdbId.mockReturnValue(null);

    const episodeMap: Record<string, PlexEpisode[]> = {};
    const shows = Array.from({ length: 4 }, (_, i) => {
      const show = makePlexShow({
        ratingKey: String(i + 1),
        title: `Show ${i + 1}`,
        externalIds: [{ source: 'tvdb', id: String(80000 + i) }],
      });
      episodeMap[String(i + 1)] = [];
      return show;
    });

    mockAddTvShow.mockResolvedValue({
      show: { id: 1, title: 'Test' } as unknown as import('@pops/db-types').TvShowRow,
      seasons: [],
      created: true,
    });

    const client = makePlexClient(shows, episodeMap);

    const result = await importTvShowsFromPlex(client, '2');

    expect(result.total).toBe(4);
    expect(result.processed).toBe(4);
    expect(result.synced).toBe(4);
    expect(result.errors).toHaveLength(0);
    expect(mockAddTvShow).toHaveBeenCalledTimes(4);
  });

  it('wraps episode watch syncing in a transaction', async () => {
    const mockTransaction = vi.fn((fn: () => unknown) => fn);
    mockGetDb.mockReturnValue({
      transaction: mockTransaction,
    } as unknown as BetterSqlite3.Database);

    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);
    mockAddTvShow.mockResolvedValue({
      show: { id: 1, title: 'Breaking Bad' } as unknown as import('@pops/db-types').TvShowRow,
      seasons: [],
      created: true,
    });
    mockGetTvShowByTvdbId.mockReturnValue({
      id: 1,
    } as unknown as import('@pops/db-types').TvShowRow);
    makeMockDb({ id: 10 }, { id: 100 });

    const ep = makePlexEpisode({ viewCount: 1, lastViewedAt: 1711400000 });
    const show = makePlexShow();
    const client = makePlexClient([show], { '200': [ep] });

    await importTvShowsFromPlex(client, '2');

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('single show failure does not affect other shows', async () => {
    const fakeTvdbClient = {} as ReturnType<typeof getTvdbClient>;
    mockGetTvdbClient.mockReturnValue(fakeTvdbClient);
    mockGetTvShowByTvdbId.mockReturnValue(null);

    const show1 = makePlexShow({ ratingKey: '1', title: 'Show 1' });
    const show2 = makePlexShow({ ratingKey: '2', title: 'Show 2' });
    const show3 = makePlexShow({ ratingKey: '3', title: 'Show 3' });

    mockAddTvShow
      .mockResolvedValueOnce({
        show: { id: 1, title: 'Show 1' } as unknown as import('@pops/db-types').TvShowRow,
        seasons: [],
        created: true,
      })
      .mockRejectedValueOnce(new Error('TVDB fetch failed for show 2'))
      .mockResolvedValueOnce({
        show: { id: 3, title: 'Show 3' } as unknown as import('@pops/db-types').TvShowRow,
        seasons: [],
        created: true,
      });

    const client = makePlexClient([show1, show2, show3], { '1': [], '3': [] });

    const result = await importTvShowsFromPlex(client, '2');

    expect(result.synced).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.title).toBe('Show 2');
    expect(result.processed).toBe(3);
  });
});
