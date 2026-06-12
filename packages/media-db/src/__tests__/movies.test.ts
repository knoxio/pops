/**
 * Invariant tests for the movies service against an in-memory SQLite
 * seeded with the canonical `0022_media_movies_baseline.sql` migration.
 * Pure DB + service layer — no tRPC, no Express, no media-discovery
 * orchestration.
 *
 * Higher-level CRUD integration coverage lives in pops-api's own suite
 * (`apps/pops-api/src/modules/media/movies/service.test.ts`) and continues
 * to exercise the same persisted shape via the in-tree shim until PRD-165
 * PR 3 flips it onto this service.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { MovieConflictError, MovieNotFoundError } from '../errors.js';
import {
  createMovie,
  deleteMovie,
  getMovie,
  getMovieByTmdbId,
  listMovies,
  updateMovie,
  type CreateMovieInput,
} from '../services/movies.js';

import type { MediaDb } from '../services/internal.js';

const MIGRATION_PATH = join(__dirname, '../../migrations/0022_media_movies_baseline.sql');

function freshDb(): { db: MediaDb; raw: Database.Database } {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return { db: drizzle(raw), raw };
}

function baseInput(overrides: Partial<CreateMovieInput> = {}): CreateMovieInput {
  return {
    tmdbId: 603,
    title: 'The Matrix',
    releaseDate: '1999-03-31',
    runtime: 136,
    genres: ['Action', 'Science Fiction'],
    ...overrides,
  };
}

describe('createMovie', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('persists the row and returns it with an assigned id', () => {
    const row = createMovie(db, baseInput());
    expect(row.id).toBeGreaterThan(0);
    expect(row.tmdbId).toBe(603);
    expect(row.title).toBe('The Matrix');
    expect(row.runtime).toBe(136);
    expect(row.releaseDate).toBe('1999-03-31');
  });

  it('serialises genres as a JSON array string in the persisted column', () => {
    const row = createMovie(db, baseInput({ genres: ['Action', 'Science Fiction'] }));
    expect(row.genres).toBe(JSON.stringify(['Action', 'Science Fiction']));
  });

  it('defaults genres to an empty JSON array when omitted', () => {
    const row = createMovie(db, baseInput({ genres: undefined }));
    expect(row.genres).toBe('[]');
  });

  it('null-fills every optional column when omitted', () => {
    const row = createMovie(db, { tmdbId: 1, title: 'Minimal' });
    expect(row.imdbId).toBeNull();
    expect(row.overview).toBeNull();
    expect(row.tagline).toBeNull();
    expect(row.releaseDate).toBeNull();
    expect(row.runtime).toBeNull();
    expect(row.voteAverage).toBeNull();
    expect(row.voteCount).toBeNull();
    expect(row.posterPath).toBeNull();
    expect(row.backdropPath).toBeNull();
    expect(row.logoPath).toBeNull();
    expect(row.posterOverridePath).toBeNull();
  });

  it('throws MovieConflictError when the tmdb_id unique index is violated', () => {
    createMovie(db, baseInput());
    expect(() => createMovie(db, baseInput({ title: 'Duplicate' }))).toThrow(MovieConflictError);
  });
});

describe('getMovie', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('returns the persisted row by id', () => {
    const created = createMovie(db, baseInput());
    expect(getMovie(db, created.id)).toEqual(created);
  });

  it('throws MovieNotFoundError when the id is missing', () => {
    expect(() => getMovie(db, 9_999)).toThrow(MovieNotFoundError);
  });
});

describe('getMovieByTmdbId', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('returns the persisted row when present', () => {
    const created = createMovie(db, baseInput());
    expect(getMovieByTmdbId(db, 603)).toEqual(created);
  });

  it('returns null when no row matches', () => {
    expect(getMovieByTmdbId(db, 999_999)).toBeNull();
  });

  it('does not throw on miss — null is the contract', () => {
    expect(() => getMovieByTmdbId(db, 1)).not.toThrow();
  });
});

describe('listMovies', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
    createMovie(db, baseInput({ tmdbId: 603, title: 'The Matrix', releaseDate: '1999-03-31' }));
    createMovie(db, baseInput({ tmdbId: 27205, title: 'Inception', releaseDate: '2010-07-16' }));
    createMovie(
      db,
      baseInput({
        tmdbId: 157336,
        title: 'Interstellar',
        releaseDate: '2014-11-05',
        genres: ['Adventure', 'Drama'],
      })
    );
  });

  it('returns rows ordered by release_date DESC and an accurate total', () => {
    const result = listMovies(db, {}, 10, 0);
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.title)).toEqual(['Interstellar', 'Inception', 'The Matrix']);
  });

  it('respects limit + offset for pagination', () => {
    const result = listMovies(db, {}, 1, 1);
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.title)).toEqual(['Inception']);
  });

  it('filters by title LIKE when `search` is set', () => {
    const result = listMovies(db, { search: 'Inter' }, 10, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.title).toBe('Interstellar');
  });

  it('filters by genre via json_each on the genres column', () => {
    const result = listMovies(db, { genre: 'Drama' }, 10, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.title).toBe('Interstellar');
  });

  it('combines `search` and `genre` with AND', () => {
    const result = listMovies(db, { search: 'Inter', genre: 'Adventure' }, 10, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.title).toBe('Interstellar');

    const empty = listMovies(db, { search: 'Inter', genre: 'Action' }, 10, 0);
    expect(empty.total).toBe(0);
    expect(empty.rows).toHaveLength(0);
  });
});

describe('updateMovie', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('updates the supplied fields and re-reads the row', () => {
    const created = createMovie(db, baseInput());
    const updated = updateMovie(db, created.id, { title: 'The Matrix (Reloaded)', runtime: 138 });
    expect(updated.title).toBe('The Matrix (Reloaded)');
    expect(updated.runtime).toBe(138);
    expect(updated.tmdbId).toBe(603);
  });

  it('round-trips genres through JSON.stringify', () => {
    const created = createMovie(db, baseInput());
    const updated = updateMovie(db, created.id, { genres: ['Action'] });
    expect(updated.genres).toBe(JSON.stringify(['Action']));
  });

  it('treats `null` on optional fields as a clear, not a skip', () => {
    const created = createMovie(db, baseInput({ tagline: 'Hello world' }));
    const updated = updateMovie(db, created.id, { tagline: null });
    expect(updated.tagline).toBeNull();
  });

  it('skips the UPDATE entirely when no fields are supplied (no-op patch)', () => {
    const created = createMovie(db, baseInput());
    const updated = updateMovie(db, created.id, {});
    expect(updated.updatedAt).toBe(created.updatedAt);
    expect(updated).toEqual(created);
  });

  it('bumps updated_at when any field is touched', () => {
    const created = createMovie(db, baseInput());
    const updated = updateMovie(db, created.id, { title: 'New title' });
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it('throws MovieNotFoundError when the id is missing', () => {
    expect(() => updateMovie(db, 9_999, { title: 'x' })).toThrow(MovieNotFoundError);
  });
});

describe('deleteMovie', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('removes the row and a subsequent get throws MovieNotFoundError', () => {
    const created = createMovie(db, baseInput());
    deleteMovie(db, created.id);
    expect(() => getMovie(db, created.id)).toThrow(MovieNotFoundError);
  });

  it('throws MovieNotFoundError when the id is missing', () => {
    expect(() => deleteMovie(db, 9_999)).toThrow(MovieNotFoundError);
  });
});
