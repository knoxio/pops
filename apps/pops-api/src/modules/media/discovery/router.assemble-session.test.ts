import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShelfInstance } from './shelf/types.js';
import type { ScoredDiscoverResult } from './types.js';

// Mock the shelf-assembly dependencies before any imports
const mockAssembledShelves = vi.hoisted(() => ({ value: [] as ShelfInstance[] }));
const mockImpressionsRecorded = vi.hoisted(() => ({ value: [] as string[] }));
const mockImpressions = vi.hoisted(() => ({ value: new Map<string, number>() }));

vi.mock('./shelf/session.service.js', () => ({
  assembleSession: vi.fn(() => mockAssembledShelves.value),
}));

vi.mock('./shelf/impressions.service.js', () => ({
  getRecentImpressions: vi.fn(() => mockImpressions.value),
  recordImpressions: vi.fn((ids: string[]) => {
    mockImpressionsRecorded.value.push(...ids);
  }),
  getShelfFreshness: vi.fn(() => 1.0),
  cleanupOldImpressions: vi.fn(),
  initImpressionsService: vi.fn(),
}));

vi.mock('./service.js', () => ({
  getPreferenceProfile: vi.fn(() => ({
    genreAffinities: [],
    dimensionWeights: [],
    genreDistribution: [],
    totalMoviesWatched: 10,
    totalComparisons: 20,
  })),
  getPreferenceProfileSync: vi.fn(() => ({
    genreAffinities: [],
    dimensionWeights: [],
    genreDistribution: [],
    totalMoviesWatched: 10,
    totalComparisons: 20,
  })),
  getDismissed: vi.fn(() => []),
  dismiss: vi.fn(),
  undismiss: vi.fn(),
  getQuickPickMovies: vi.fn(() => []),
  getRewatchSuggestions: vi.fn(() => []),
  getUnwatchedLibraryMovies: vi.fn(() => []),
  scoreDiscoverResults: vi.fn((results: unknown[]) => results as ScoredDiscoverResult[]),
}));

// Mock TMDB + plex so router.ts can load without real API keys
vi.mock('../../tmdb/index.js', () => ({
  getTmdbClient: vi.fn(() => ({
    getTrendingMovies: vi.fn(),
    getMovieRecommendations: vi.fn(),
    getMovieSimilar: vi.fn(),
    discoverMovies: vi.fn(),
  })),
}));

vi.mock('../plex/client.js', () => ({
  getPlexClient: vi.fn(() => null),
}));

vi.mock('../plex/sync.js', () => ({ syncFromPlex: vi.fn() }));
vi.mock('../plex/sync-cloud.js', () => ({ syncPlexCloud: vi.fn() }));
vi.mock('../plex/sync-watchlist.js', () => ({ syncPlexWatchlist: vi.fn() }));
vi.mock('../plex/scheduler.js', () => ({ startPlexScheduler: vi.fn() }));
vi.mock('./plex-service.js', () => ({
  getTrendingFromPlex: vi.fn(async () => null),
}));
vi.mock('./tmdb-service.js', () => ({
  getTrending: vi.fn(),
  getRecommendations: vi.fn(),
  getWatchlistRecommendations: vi.fn(),
  getLibraryTmdbIds: vi.fn(() => new Set()),
  toDiscoverResults: vi.fn(() => []),
}));
vi.mock('./context-picks-service.js', () => ({
  getContextPicks: vi.fn(async () => ({ collections: [] })),
}));
vi.mock('./genre-spotlight-service.js', () => ({
  getGenreSpotlight: vi.fn(async () => ({ genres: [] })),
  getGenreSpotlightPage: vi.fn(async () => ({ results: [] })),
}));
vi.mock('./flags.js', () => ({
  getDismissedTmdbIds: vi.fn(() => new Set()),
  getWatchedTmdbIds: vi.fn(() => new Set()),
  getWatchlistTmdbIds: vi.fn(() => new Set()),
}));

// Mock the shelf module side effects (auto-registration)
vi.mock('./shelf/registry.js', () => ({
  registerShelf: vi.fn(),
  getRegisteredShelves: vi.fn(() => []),
  _clearRegistry: vi.fn(),
}));

import { setupTestContext } from '../../../shared/test-utils.js';
import { recordImpressions } from './shelf/impressions.service.js';
import { assembleSession } from './shelf/session.service.js';

const mockAssembleSession = vi.mocked(assembleSession);
const mockRecordImpressions = vi.mocked(recordImpressions);

const ctx = setupTestContext();
let caller: ReturnType<(typeof ctx)['setup']>['caller'];

beforeEach(() => {
  const setup = ctx.setup();
  caller = setup.caller;
  mockAssembledShelves.value = [];
  mockImpressionsRecorded.value = [];
  mockImpressions.value = new Map();
  mockAssembleSession.mockClear();
  mockRecordImpressions.mockClear();

  return ctx.teardown;
});

function makeShelfInstance(shelfId: string, itemCount: number): ShelfInstance {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    tmdbId: 100 + i,
    title: `Movie ${i}`,
    overview: 'A film',
    releaseDate: '2024-01-01',
    posterPath: null,
    posterUrl: null,
    backdropPath: null,
    voteAverage: 7.5,
    voteCount: 500,
    genreIds: [28],
    popularity: 50,
    inLibrary: false,
    isWatched: false,
    onWatchlist: false,
    matchPercentage: 70,
    matchReason: 'Genre',
  }));
  return {
    shelfId,
    title: `Shelf ${shelfId}`,
    score: 0.8,
    query: vi.fn(async () => items),
  };
}

describe('media.discovery.assembleSession', () => {
  it('returns empty shelves when assembly returns nothing', async () => {
    mockAssembledShelves.value = [];
    const result = await caller.media.discovery.assembleSession();
    expect(result.shelves).toHaveLength(0);
  });

  it('returns shelves with items when shelves have >= 3 results', async () => {
    mockAssembledShelves.value = [
      makeShelfInstance('because-you-watched:1', 5),
      makeShelfInstance('trending-tmdb', 10),
    ];
    const result = await caller.media.discovery.assembleSession();
    expect(result.shelves).toHaveLength(2);
    expect(result.shelves[0]!.shelfId).toBe('because-you-watched:1');
    expect(result.shelves[0]!.items).toHaveLength(5);
    expect(result.shelves[1]!.shelfId).toBe('trending-tmdb');
  });

  it('filters out shelves with fewer than 3 results', async () => {
    mockAssembledShelves.value = [
      makeShelfInstance('because-you-watched:1', 5),
      makeShelfInstance('empty-shelf', 2), // < 3 — should be filtered
      makeShelfInstance('trending-tmdb', 8),
    ];
    const result = await caller.media.discovery.assembleSession();
    expect(result.shelves).toHaveLength(2);
    expect(result.shelves.map((s) => s.shelfId)).not.toContain('empty-shelf');
  });

  it('records impressions only for shelves with enough results', async () => {
    mockAssembledShelves.value = [
      makeShelfInstance('because-you-watched:1', 5),
      makeShelfInstance('empty-shelf', 2), // < 3 — not recorded
      makeShelfInstance('trending-tmdb', 8),
    ];
    await caller.media.discovery.assembleSession();
    expect(mockRecordImpressions).toHaveBeenCalledWith(
      expect.arrayContaining(['because-you-watched:1', 'trending-tmdb'])
    );
    const recorded = mockRecordImpressions.mock.calls[0]![0];
    expect(recorded).not.toContain('empty-shelf');
  });

  it('sets hasMore=true when shelf returns exactly 10 items', async () => {
    mockAssembledShelves.value = [makeShelfInstance('trending-tmdb', 10)];
    const result = await caller.media.discovery.assembleSession();
    expect(result.shelves[0]!.hasMore).toBe(true);
  });

  it('sets hasMore=false when shelf returns fewer than 10 items', async () => {
    mockAssembledShelves.value = [makeShelfInstance('trending-tmdb', 5)];
    const result = await caller.media.discovery.assembleSession();
    expect(result.shelves[0]!.hasMore).toBe(false);
  });

  it('includes shelf metadata (title, subtitle, emoji) in response', async () => {
    const shelf = makeShelfInstance('because-you-watched:1', 5);
    shelf.subtitle = 'Movies similar to a recent watch';
    shelf.emoji = '🎬';
    mockAssembledShelves.value = [shelf];
    const result = await caller.media.discovery.assembleSession();
    expect(result.shelves[0]!.title).toBe('Shelf because-you-watched:1');
    expect(result.shelves[0]!.subtitle).toBe('Movies similar to a recent watch');
    expect(result.shelves[0]!.emoji).toBe('🎬');
  });

  it('handles a shelf query failure gracefully — returns empty for that shelf', async () => {
    const failingShelf = makeShelfInstance('broken-shelf', 0);
    (failingShelf.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('TMDB down'));
    const goodShelf = makeShelfInstance('trending-tmdb', 5);
    mockAssembledShelves.value = [failingShelf, goodShelf];

    const result = await caller.media.discovery.assembleSession();
    // Failing shelf has 0 items → filtered out (< 3). Only good shelf remains.
    expect(result.shelves.map((s) => s.shelfId)).not.toContain('broken-shelf');
    expect(result.shelves.map((s) => s.shelfId)).toContain('trending-tmdb');
  });
});
