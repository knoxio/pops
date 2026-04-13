/**
 * Tests for TMDB top rated rotation source adapter.
 *
 * PRD-071 US-04
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CandidateMovie } from './source-types.js';

// Mock TMDB client
const mockDiscoverMovies = vi.fn();
vi.mock('../tmdb/index.js', () => ({
  getTmdbClient: () => ({
    discoverMovies: mockDiscoverMovies,
  }),
}));

// Mock logger
vi.mock('../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

// Import after mocks
const { tmdbTopRatedSource } = await import('./tmdb-top-rated-source.js');

describe('tmdbTopRatedSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct type identifier', () => {
    expect(tmdbTopRatedSource.type).toBe('tmdb_top_rated');
  });

  it('fetches candidates from TMDB discover endpoint', async () => {
    mockDiscoverMovies.mockResolvedValueOnce({
      page: 1,
      totalPages: 1,
      totalResults: 2,
      results: [
        {
          tmdbId: 278,
          title: 'The Shawshank Redemption',
          releaseDate: '1994-09-23',
          voteAverage: 8.7,
          posterPath: '/9O7gLzmreU0nGkIB6K3BsJbzvNv.jpg',
          originalTitle: 'The Shawshank Redemption',
          overview: '',
          backdropPath: null,
          voteCount: 25000,
          genreIds: [18, 80],
          originalLanguage: 'en',
          popularity: 100,
        },
        {
          tmdbId: 238,
          title: 'The Godfather',
          releaseDate: '1972-03-14',
          voteAverage: 8.7,
          posterPath: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
          originalTitle: 'The Godfather',
          overview: '',
          backdropPath: null,
          voteCount: 19000,
          genreIds: [18, 80],
          originalLanguage: 'en',
          popularity: 90,
        },
      ],
    });

    const candidates = await tmdbTopRatedSource.fetchCandidates({ pages: 1 });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual<CandidateMovie>({
      tmdbId: 278,
      title: 'The Shawshank Redemption',
      year: 1994,
      rating: 8.7,
      posterPath: '/9O7gLzmreU0nGkIB6K3BsJbzvNv.jpg',
    });
    expect(candidates[1]).toEqual<CandidateMovie>({
      tmdbId: 238,
      title: 'The Godfather',
      year: 1972,
      rating: 8.7,
      posterPath: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
    });

    expect(mockDiscoverMovies).toHaveBeenCalledWith({
      sortBy: 'vote_average.desc',
      voteCountGte: 500,
      page: 1,
    });
  });

  it('paginates across multiple pages', async () => {
    mockDiscoverMovies
      .mockResolvedValueOnce({
        page: 1,
        totalPages: 3,
        totalResults: 60,
        results: [
          {
            tmdbId: 278,
            title: 'Movie 1',
            releaseDate: '1994-01-01',
            voteAverage: 9.0,
            posterPath: null,
            originalTitle: '',
            overview: '',
            backdropPath: null,
            voteCount: 1000,
            genreIds: [],
            originalLanguage: 'en',
            popularity: 50,
          },
        ],
      })
      .mockResolvedValueOnce({
        page: 2,
        totalPages: 3,
        totalResults: 60,
        results: [
          {
            tmdbId: 238,
            title: 'Movie 2',
            releaseDate: '1972-01-01',
            voteAverage: 8.5,
            posterPath: null,
            originalTitle: '',
            overview: '',
            backdropPath: null,
            voteCount: 900,
            genreIds: [],
            originalLanguage: 'en',
            popularity: 40,
          },
        ],
      });

    const candidates = await tmdbTopRatedSource.fetchCandidates({ pages: 2 });

    expect(candidates).toHaveLength(2);
    expect(mockDiscoverMovies).toHaveBeenCalledTimes(2);
  });

  it('defaults to 5 pages when not specified', async () => {
    // Return empty results for all pages
    mockDiscoverMovies.mockResolvedValue({
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });

    await tmdbTopRatedSource.fetchCandidates({});

    // With totalPages=1, it stops after first page
    expect(mockDiscoverMovies).toHaveBeenCalledTimes(1);
  });

  it('caps pages at 25', async () => {
    mockDiscoverMovies.mockResolvedValue({
      page: 1,
      totalPages: 100,
      totalResults: 2000,
      results: [
        {
          tmdbId: 1,
          title: 'Movie',
          releaseDate: '2020-01-01',
          voteAverage: 7.0,
          posterPath: null,
          originalTitle: '',
          overview: '',
          backdropPath: null,
          voteCount: 600,
          genreIds: [],
          originalLanguage: 'en',
          popularity: 30,
        },
      ],
    });

    await tmdbTopRatedSource.fetchCandidates({ pages: 50 });

    expect(mockDiscoverMovies).toHaveBeenCalledTimes(25);
  });

  it('handles null release date gracefully', async () => {
    mockDiscoverMovies.mockResolvedValueOnce({
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          tmdbId: 999,
          title: 'Unknown Year Movie',
          releaseDate: '',
          voteAverage: 7.5,
          posterPath: null,
          originalTitle: '',
          overview: '',
          backdropPath: null,
          voteCount: 600,
          genreIds: [],
          originalLanguage: 'en',
          popularity: 20,
        },
      ],
    });

    const candidates = await tmdbTopRatedSource.fetchCandidates({ pages: 1 });

    expect(candidates[0]!.year).toBeNull();
  });

  it('returns empty array and logs warning on API error', async () => {
    mockDiscoverMovies.mockRejectedValueOnce(new Error('API rate limited'));

    const candidates = await tmdbTopRatedSource.fetchCandidates({ pages: 1 });

    expect(candidates).toHaveLength(0);
  });

  it('stops early when totalPages exhausted', async () => {
    mockDiscoverMovies.mockResolvedValueOnce({
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          tmdbId: 100,
          title: 'Only Movie',
          releaseDate: '2020-01-01',
          voteAverage: 8.0,
          posterPath: null,
          originalTitle: '',
          overview: '',
          backdropPath: null,
          voteCount: 700,
          genreIds: [],
          originalLanguage: 'en',
          popularity: 25,
        },
      ],
    });

    const candidates = await tmdbTopRatedSource.fetchCandidates({ pages: 5 });

    expect(candidates).toHaveLength(1);
    expect(mockDiscoverMovies).toHaveBeenCalledTimes(1);
  });
});
