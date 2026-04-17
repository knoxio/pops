import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedMovie, setupTestContext } from '../../../shared/test-utils.js';
import * as service from './service.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  const result = ctx.setup();
  db = result.db;
});

afterEach(() => {
  ctx.teardown();
});

describe('listMovies', () => {
  it('returns empty list when no movies exist', () => {
    const result = service.listMovies({}, 50, 0);
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('returns all movies with pagination', () => {
    seedMovie(db, { tmdb_id: 1, title: 'Movie A', release_date: '2025-01-01' });
    seedMovie(db, { tmdb_id: 2, title: 'Movie B', release_date: '2025-06-01' });
    seedMovie(db, { tmdb_id: 3, title: 'Movie C', release_date: '2025-03-01' });

    const result = service.listMovies({}, 2, 0);
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(3);
    // Ordered by release_date DESC
    expect(result.rows[0]!.title).toBe('Movie B');
  });

  it('filters by search term', () => {
    seedMovie(db, { tmdb_id: 1, title: 'The Matrix' });
    seedMovie(db, { tmdb_id: 2, title: 'Inception' });

    const result = service.listMovies({ search: 'Matrix' }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.title).toBe('The Matrix');
  });

  it('filters by genre', () => {
    seedMovie(db, { tmdb_id: 1, title: 'Action Movie', genres: '["Action","Sci-Fi"]' });
    seedMovie(db, { tmdb_id: 2, title: 'Comedy Movie', genres: '["Comedy"]' });

    const result = service.listMovies({ genre: 'Action' }, 50, 0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.title).toBe('Action Movie');
  });
});

describe('getMovie', () => {
  it('returns a movie by id', () => {
    const id = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });
    const movie = service.getMovie(id);
    expect(movie.title).toBe('Fight Club');
    expect(movie.tmdbId).toBe(550);
  });

  it('throws NotFoundError for missing movie', () => {
    expect(() => service.getMovie(999)).toThrow('Movie');
  });
});

describe('createMovie', () => {
  it('creates a movie and returns the row', () => {
    const movie = service.createMovie({
      tmdbId: 550,
      title: 'Fight Club',
      releaseDate: '1999-10-15',
      runtime: 139,
      genres: ['Drama', 'Thriller'],
    });

    expect(movie.id).toBeGreaterThan(0);
    expect(movie.title).toBe('Fight Club');
    expect(movie.tmdbId).toBe(550);
    expect(movie.releaseDate).toBe('1999-10-15');
    expect(movie.runtime).toBe(139);
    expect(JSON.parse(movie.genres!)).toEqual(['Drama', 'Thriller']);
  });

  it('sets default values for optional fields', () => {
    const movie = service.createMovie({
      tmdbId: 100,
      title: 'Minimal Movie',
      genres: [],
    });

    expect(movie.imdbId).toBeNull();
    expect(movie.overview).toBeNull();
    expect(movie.genres).toBe('[]');
  });

  it('throws ConflictError on duplicate tmdbId', () => {
    service.createMovie({ tmdbId: 550, title: 'Fight Club', genres: [] });
    expect(() =>
      service.createMovie({ tmdbId: 550, title: 'Fight Club Copy', genres: [] })
    ).toThrow('already exists');
  });
});

describe('updateMovie', () => {
  it('updates specified fields only', () => {
    const id = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });

    const updated = service.updateMovie(id, { title: 'Fight Club (Updated)' });
    expect(updated.title).toBe('Fight Club (Updated)');
    expect(updated.tmdbId).toBe(550); // unchanged
  });

  it('updates genres as JSON', () => {
    const id = seedMovie(db, { tmdb_id: 550, title: 'Fight Club', genres: '["Drama"]' });

    const updated = service.updateMovie(id, { genres: ['Drama', 'Thriller'] });
    expect(JSON.parse(updated.genres!)).toEqual(['Drama', 'Thriller']);
  });

  it('throws NotFoundError for missing movie', () => {
    expect(() => service.updateMovie(999, { title: 'Nope' })).toThrow('Movie');
  });
});

describe('deleteMovie', () => {
  it('deletes an existing movie', () => {
    const id = seedMovie(db, { tmdb_id: 550, title: 'Fight Club' });

    service.deleteMovie(id);
    expect(() => service.getMovie(id)).toThrow('Movie');
  });

  it('throws NotFoundError for missing movie', () => {
    expect(() => {
      service.deleteMovie(999);
    }).toThrow('Movie');
  });
});
