/**
 * Tests for existing-shelves.ts (GH-1385).
 *
 * Each shelf is tested by mocking the underlying service function it wraps.
 * No business logic is re-tested — we verify delegation and interface mapping.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../tmdb/index.js', () => ({
  getTmdbClient: vi.fn(() => ({})),
}));

vi.mock('../tmdb-service.js', () => ({
  getTrending: vi.fn(),
  getRecommendations: vi.fn(),
  getWatchlistRecommendations: vi.fn(),
}));

vi.mock('../plex-service.js', () => ({
  getTrendingFromPlex: vi.fn(),
}));

vi.mock('../service.js', () => ({
  getPreferenceProfile: vi.fn(),
  getUnwatchedLibraryMovies: vi.fn(),
  scoreDiscoverResults: vi.fn(),
  getRewatchSuggestions: vi.fn(),
}));

vi.mock('./registry.js', () => ({
  registerShelf: vi.fn(),
  getRegisteredShelves: vi.fn(() => []),
  _clearRegistry: vi.fn(),
}));

import * as plexService from '../plex-service.js';
import * as service from '../service.js';
import * as tmdbService from '../tmdb-service.js';
import {
  fromYourServerShelf,
  fromYourWatchlistShelf,
  recommendationsShelf,
  trendingPlexShelf,
  trendingTmdbShelf,
  worthRewatchingShelf,
} from './existing-shelves.js';

const mockTrendingService = vi.mocked(tmdbService.getTrending);
const mockGetRecommendations = vi.mocked(tmdbService.getRecommendations);
const mockGetWatchlistRecs = vi.mocked(tmdbService.getWatchlistRecommendations);
const mockGetTrendingFromPlex = vi.mocked(plexService.getTrendingFromPlex);
const mockGetProfile = vi.mocked(service.getPreferenceProfile);
const mockGetUnwatched = vi.mocked(service.getUnwatchedLibraryMovies);
const mockScoreResults = vi.mocked(service.scoreDiscoverResults);
const mockGetRewatch = vi.mocked(service.getRewatchSuggestions);

/** Stub PreferenceProfile. */
const stubProfile = {
  genreAffinities: [],
  genreDistribution: [],
  dimensionWeights: [],
  totalMoviesWatched: 0,
  totalComparisons: 10,
};

/** Minimal DiscoverResult stub. */
function makeDiscoverResult(tmdbId: number) {
  return {
    tmdbId,
    title: `Movie ${tmdbId}`,
    overview: '',
    releaseDate: '2024-01-01',
    posterPath: null,
    posterUrl: null,
    backdropPath: null,
    voteAverage: 7.0,
    voteCount: 1000,
    genreIds: [],
    popularity: 100,
    inLibrary: false,
    isWatched: false,
    onWatchlist: false,
  };
}

/** Minimal ScoredDiscoverResult stub. */
function makeScoredResult(tmdbId: number) {
  return { ...makeDiscoverResult(tmdbId), matchPercentage: 80, matchReason: 'genre' };
}

/** Minimal RewatchSuggestion stub. */
function makeRewatchSuggestion(tmdbId: number) {
  return {
    id: tmdbId,
    tmdbId,
    title: `Movie ${tmdbId}`,
    releaseDate: '2020-01-01',
    posterPath: null,
    posterUrl: null,
    voteAverage: 8.0,
    eloScore: 1600,
    score: 1600,
    inLibrary: true as const,
  };
}

// ---------------------------------------------------------------------------
// trending-tmdb
// ---------------------------------------------------------------------------

describe('trendingTmdbShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has category=tmdb, template=false, id=trending-tmdb', () => {
    expect(trendingTmdbShelf.category).toBe('tmdb');
    expect(trendingTmdbShelf.template).toBe(false);
    expect(trendingTmdbShelf.id).toBe('trending-tmdb');
  });

  it('generates exactly one instance', () => {
    expect(trendingTmdbShelf.generate(stubProfile)).toHaveLength(1);
  });

  it('returns results from getTrending', async () => {
    const results = [makeDiscoverResult(1), makeDiscoverResult(2)];
    mockTrendingService.mockResolvedValue({ results, totalResults: 2, page: 1 });

    const [instance] = trendingTmdbShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(2);
    expect(out[0]!.tmdbId).toBe(1);
  });

  it('returns empty when getTrending returns no results', async () => {
    mockTrendingService.mockResolvedValue({ results: [], totalResults: 0, page: 1 });

    const [instance] = trendingTmdbShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(0);
  });

  it('applies offset within TMDB page', async () => {
    // offset=5 → page=1, start=5
    const results = Array.from({ length: 20 }, (_, i) => makeDiscoverResult(i + 1));
    mockTrendingService.mockResolvedValue({ results, totalResults: 20, page: 1 });

    const [instance] = trendingTmdbShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 5, offset: 5 });
    expect(out).toHaveLength(5);
    expect(out[0]!.tmdbId).toBe(6); // index 5 → tmdbId 6
  });
});

// ---------------------------------------------------------------------------
// trending-plex
// ---------------------------------------------------------------------------

describe('trendingPlexShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has category=external, id=trending-plex', () => {
    expect(trendingPlexShelf.category).toBe('external');
    expect(trendingPlexShelf.id).toBe('trending-plex');
  });

  it('returns results from getTrendingFromPlex', async () => {
    const results = [makeDiscoverResult(10), makeDiscoverResult(11)];
    mockGetTrendingFromPlex.mockResolvedValue(results);

    const [instance] = trendingPlexShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(2);
  });

  it('returns empty array when Plex is disconnected (null)', async () => {
    mockGetTrendingFromPlex.mockResolvedValue(null);

    const [instance] = trendingPlexShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// recommendations
// ---------------------------------------------------------------------------

describe('recommendationsShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has category=profile, id=recommendations', () => {
    expect(recommendationsShelf.category).toBe('profile');
    expect(recommendationsShelf.id).toBe('recommendations');
  });

  it('returns empty when below cold-start threshold (< 5 comparisons)', async () => {
    mockGetProfile.mockReturnValue({ ...stubProfile, totalComparisons: 3 });

    const [instance] = recommendationsShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(0);
    expect(mockGetRecommendations).not.toHaveBeenCalled();
  });

  it('returns scored results above cold-start threshold', async () => {
    mockGetProfile.mockReturnValue({ ...stubProfile, totalComparisons: 10 });
    mockGetRecommendations.mockResolvedValue({
      results: [makeDiscoverResult(20)],
      sourceMovies: ['Movie 1'],
    });
    const scored = [makeScoredResult(20)];
    mockScoreResults.mockReturnValue(scored);

    const [instance] = recommendationsShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(1);
    expect(out[0]!.tmdbId).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// from-your-watchlist
// ---------------------------------------------------------------------------

describe('fromYourWatchlistShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has category=tmdb, id=from-your-watchlist', () => {
    expect(fromYourWatchlistShelf.category).toBe('tmdb');
    expect(fromYourWatchlistShelf.id).toBe('from-your-watchlist');
  });

  it('returns results from getWatchlistRecommendations', async () => {
    const results = [makeScoredResult(30), makeScoredResult(31)];
    mockGetWatchlistRecs.mockResolvedValue({ results, sourceMovies: [] });

    const [instance] = fromYourWatchlistShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(2);
  });

  it('returns empty when no watchlist recommendations', async () => {
    mockGetWatchlistRecs.mockResolvedValue({ results: [], sourceMovies: [] });

    const [instance] = fromYourWatchlistShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// worth-rewatching
// ---------------------------------------------------------------------------

describe('worthRewatchingShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has category=local, id=worth-rewatching', () => {
    expect(worthRewatchingShelf.category).toBe('local');
    expect(worthRewatchingShelf.id).toBe('worth-rewatching');
  });

  it('maps RewatchSuggestion to DiscoverResult shape', async () => {
    mockGetRewatch.mockReturnValue([makeRewatchSuggestion(40)]);

    const [instance] = worthRewatchingShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(1);
    expect(out[0]!.tmdbId).toBe(40);
    expect(out[0]!.inLibrary).toBe(true);
    expect(out[0]!.isWatched).toBe(true);
    expect(out[0]!.overview).toBe('');
  });

  it('returns empty when no rewatch suggestions', async () => {
    mockGetRewatch.mockReturnValue([]);

    const [instance] = worthRewatchingShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// from-your-server
// ---------------------------------------------------------------------------

describe('fromYourServerShelf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has category=local, id=from-your-server', () => {
    expect(fromYourServerShelf.category).toBe('local');
    expect(fromYourServerShelf.id).toBe('from-your-server');
  });

  it('returns empty when no unwatched movies', async () => {
    mockGetUnwatched.mockReturnValue([]);

    const [instance] = fromYourServerShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(0);
    expect(mockScoreResults).not.toHaveBeenCalled();
  });

  it('returns scored unwatched library movies', async () => {
    mockGetUnwatched.mockReturnValue([makeDiscoverResult(50)]);
    mockGetProfile.mockReturnValue(stubProfile);
    mockScoreResults.mockReturnValue([makeScoredResult(50)]);

    const [instance] = fromYourServerShelf.generate(stubProfile);
    const out = await instance!.query({ limit: 10, offset: 0 });
    expect(out).toHaveLength(1);
    expect(out[0]!.tmdbId).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// All shelves metadata
// ---------------------------------------------------------------------------

describe('all existing shelves', () => {
  const allShelves = [
    trendingTmdbShelf,
    trendingPlexShelf,
    recommendationsShelf,
    fromYourWatchlistShelf,
    worthRewatchingShelf,
    fromYourServerShelf,
  ];

  it('all have template=false', () => {
    for (const shelf of allShelves) {
      expect(shelf.template).toBe(false);
    }
  });

  it('all generate exactly one instance', () => {
    for (const shelf of allShelves) {
      expect(shelf.generate(stubProfile)).toHaveLength(1);
    }
  });
});
