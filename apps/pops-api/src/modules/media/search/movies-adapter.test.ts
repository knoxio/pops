import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from 'better-sqlite3';

// Prevent side-effect registration from throwing on import
vi.mock('../../core/search/registry.js', () => ({
  registerSearchAdapter: vi.fn(),
  getAdapters: vi.fn(),
  resetRegistry: vi.fn(),
}));

import { seedMovie, setupTestContext } from '../../../shared/test-utils.js';
import { registerSearchAdapter } from '../../core/search/registry.js';
import { moviesSearchAdapter } from './movies-adapter.js';

import type { SearchContext } from '../../core/search/types.js';

const ctx = setupTestContext();
let db: Database;

const defaultContext: SearchContext = { app: 'media', page: 'search' };

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('moviesSearchAdapter', () => {
  it('has correct domain, icon, and color', () => {
    expect(moviesSearchAdapter.domain).toBe('movies');
    expect(moviesSearchAdapter.icon).toBe('Film');
    expect(moviesSearchAdapter.color).toBe('purple');
    expect(registerSearchAdapter).toHaveBeenCalledWith(moviesSearchAdapter);
  });

  it('returns empty array for empty query', async () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 603 });
    const hits = await moviesSearchAdapter.search({ text: '' }, defaultContext);
    expect(hits).toEqual([]);
  });

  it('returns empty array for whitespace-only query', async () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 603 });
    const hits = await moviesSearchAdapter.search({ text: '   ' }, defaultContext);
    expect(hits).toEqual([]);
  });

  it('returns empty array when no matches', async () => {
    seedMovie(db, { title: 'The Matrix', tmdb_id: 603 });
    const hits = await moviesSearchAdapter.search({ text: 'Inception' }, defaultContext);
    expect(hits).toEqual([]);
  });

  describe('scoring', () => {
    it('scores exact match as 1.0', async () => {
      seedMovie(db, { title: 'Interstellar', tmdb_id: 157336 });
      const hits = await moviesSearchAdapter.search({ text: 'Interstellar' }, defaultContext);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.score).toBe(1.0);
      expect(hits[0]!.matchType).toBe('exact');
    });

    it('scores exact match case-insensitively', async () => {
      seedMovie(db, { title: 'Interstellar', tmdb_id: 157336 });
      const hits = await moviesSearchAdapter.search({ text: 'interstellar' }, defaultContext);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.score).toBe(1.0);
      expect(hits[0]!.matchType).toBe('exact');
    });

    it('scores prefix match as 0.8', async () => {
      seedMovie(db, { title: 'The Dark Knight', tmdb_id: 155 });
      const hits = await moviesSearchAdapter.search({ text: 'The Dark' }, defaultContext);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.score).toBe(0.8);
      expect(hits[0]!.matchType).toBe('prefix');
    });

    it('scores contains match as 0.5', async () => {
      seedMovie(db, { title: 'The Dark Knight', tmdb_id: 155 });
      const hits = await moviesSearchAdapter.search({ text: 'Knight' }, defaultContext);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.score).toBe(0.5);
      expect(hits[0]!.matchType).toBe('contains');
    });

    it('sorts results by score descending', async () => {
      seedMovie(db, { title: 'Matrix', tmdb_id: 601 });
      seedMovie(db, { title: 'The Matrix', tmdb_id: 603 });
      seedMovie(db, { title: 'Matrix Reloaded', tmdb_id: 604 });

      const hits = await moviesSearchAdapter.search({ text: 'Matrix' }, defaultContext);
      expect(hits).toHaveLength(3);
      expect(hits[0]!.score).toBe(1.0); // exact: "Matrix"
      expect(hits[1]!.score).toBe(0.8); // prefix: "Matrix Reloaded"
      expect(hits[2]!.score).toBe(0.5); // contains: "The Matrix"
    });
  });

  describe('hit data', () => {
    it('returns correct hit fields', async () => {
      seedMovie(db, {
        title: 'The Shawshank Redemption',
        tmdb_id: 278,
        release_date: '1994-09-23',
        status: 'Released',
        poster_path: '/9O7gLzmreU0nGkIB6K3BsJbzvNv.jpg',
        vote_average: 8.7,
        genres: '["Drama", "Crime"]',
      });

      const hits = await moviesSearchAdapter.search(
        { text: 'The Shawshank Redemption' },
        defaultContext
      );
      expect(hits).toHaveLength(1);
      const hit = hits[0]!;
      expect(hit.matchField).toBe('title');
      expect(hit.data).toEqual({
        title: 'The Shawshank Redemption',
        year: '1994',
        posterUrl: '/media/images/movies/9O7gLzmreU0nGkIB6K3BsJbzvNv.jpg',
        status: 'Released',
        voteAverage: 8.7,
        genres: ['Drama', 'Crime'],
      });
    });

    it('returns correct URI format', async () => {
      const id = seedMovie(db, { title: 'Fight Club', tmdb_id: 550 });
      const hits = await moviesSearchAdapter.search({ text: 'Fight Club' }, defaultContext);
      expect(hits[0]!.uri).toBe(`pops:media/movie/${id}`);
    });

    it('handles null releaseDate as null year', async () => {
      seedMovie(db, { title: 'Unknown Movie', tmdb_id: 9999, release_date: null });
      const hits = await moviesSearchAdapter.search({ text: 'Unknown Movie' }, defaultContext);
      expect(hits[0]!.data.year).toBeNull();
    });

    it('handles null optional fields', async () => {
      seedMovie(db, {
        title: 'Minimal Movie',
        tmdb_id: 8888,
        status: null,
        poster_path: null,
        vote_average: null,
        genres: null,
      });
      const hits = await moviesSearchAdapter.search({ text: 'Minimal Movie' }, defaultContext);
      expect(hits[0]!.data.status).toBeNull();
      expect(hits[0]!.data.posterUrl).toBeNull();
      expect(hits[0]!.data.voteAverage).toBeNull();
      expect(hits[0]!.data.genres).toEqual([]);
    });

    it('builds poster URL from posterPath', async () => {
      seedMovie(db, {
        title: 'Pulp Fiction',
        tmdb_id: 680,
        poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
      });
      const hits = await moviesSearchAdapter.search({ text: 'Pulp Fiction' }, defaultContext);
      expect(hits[0]!.data.posterUrl).toBe('/media/images/movies/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg');
    });

    it('parses genres from JSON string', async () => {
      seedMovie(db, {
        title: 'Action Movie',
        tmdb_id: 1111,
        genres: '["Action", "Thriller"]',
      });
      const hits = await moviesSearchAdapter.search({ text: 'Action Movie' }, defaultContext);
      expect(hits[0]!.data.genres).toEqual(['Action', 'Thriller']);
    });

    it('handles invalid genres JSON gracefully', async () => {
      seedMovie(db, {
        title: 'Bad Genres',
        tmdb_id: 2222,
        genres: 'not-json',
      });
      const hits = await moviesSearchAdapter.search({ text: 'Bad Genres' }, defaultContext);
      expect(hits[0]!.data.genres).toEqual([]);
    });
  });

  describe('options', () => {
    it('respects limit option', async () => {
      for (let i = 0; i < 5; i++) {
        seedMovie(db, { title: `Movie ${i}`, tmdb_id: 10000 + i });
      }
      const hits = await moviesSearchAdapter.search({ text: 'Movie' }, defaultContext, {
        limit: 3,
      });
      expect(hits).toHaveLength(3);
    });

    it('defaults limit to 20', async () => {
      for (let i = 0; i < 25; i++) {
        seedMovie(db, { title: `Movie ${i}`, tmdb_id: 10000 + i });
      }
      const hits = await moviesSearchAdapter.search({ text: 'Movie' }, defaultContext);
      expect(hits).toHaveLength(20);
    });
  });
});
