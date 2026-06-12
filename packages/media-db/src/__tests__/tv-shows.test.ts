/**
 * Invariant tests for the tv-shows service against an in-memory SQLite
 * seeded with the canonical `0024_media_tv_shows_baseline.sql` migration.
 * Pure DB + service layer — no tRPC, no Express, no media-discovery
 * orchestration.
 *
 * Higher-level CRUD integration coverage lives in pops-api's own suite
 * (`apps/pops-api/src/modules/media/tv-shows/tv-shows.test.ts`) and
 * continues to exercise the same persisted shape via the in-tree shim
 * until PRD-166 PR 3 flips it onto this service.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { TvShowConflictError, TvShowNotFoundError } from '../errors.js';
import {
  createTvShow,
  deleteTvShow,
  getTvShow,
  getTvShowByTvdbId,
  listTvShows,
  updateTvShow,
  type CreateTvShowInput,
} from '../services/tv-shows.js';

import type { MediaDb } from '../services/internal.js';

const MIGRATION_PATH = join(__dirname, '../../migrations/0024_media_tv_shows_baseline.sql');

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

function baseInput(overrides: Partial<CreateTvShowInput> = {}): CreateTvShowInput {
  return {
    tvdbId: 81189,
    name: 'Breaking Bad',
    firstAirDate: '2008-01-20',
    status: 'Ended',
    genres: ['Drama', 'Crime'],
    networks: ['AMC'],
    ...overrides,
  };
}

describe('createTvShow', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('persists the row and returns it with an assigned id', () => {
    const row = createTvShow(db, baseInput());
    expect(row.id).toBeGreaterThan(0);
    expect(row.tvdbId).toBe(81189);
    expect(row.name).toBe('Breaking Bad');
    expect(row.status).toBe('Ended');
    expect(row.firstAirDate).toBe('2008-01-20');
  });

  it('serialises genres + networks as JSON array strings in the persisted columns', () => {
    const row = createTvShow(db, baseInput({ genres: ['Drama', 'Crime'], networks: ['AMC'] }));
    expect(row.genres).toBe(JSON.stringify(['Drama', 'Crime']));
    expect(row.networks).toBe(JSON.stringify(['AMC']));
  });

  it('persists genres + networks as NULL when omitted (not "[]")', () => {
    const row = createTvShow(db, { tvdbId: 1, name: 'Minimal' });
    expect(row.genres).toBeNull();
    expect(row.networks).toBeNull();
  });

  it('null-fills every optional column when omitted', () => {
    const row = createTvShow(db, { tvdbId: 2, name: 'Bare' });
    expect(row.originalName).toBeNull();
    expect(row.overview).toBeNull();
    expect(row.firstAirDate).toBeNull();
    expect(row.lastAirDate).toBeNull();
    expect(row.status).toBeNull();
    expect(row.originalLanguage).toBeNull();
    expect(row.numberOfSeasons).toBeNull();
    expect(row.numberOfEpisodes).toBeNull();
    expect(row.episodeRunTime).toBeNull();
    expect(row.posterPath).toBeNull();
    expect(row.backdropPath).toBeNull();
    expect(row.logoPath).toBeNull();
    expect(row.posterOverridePath).toBeNull();
    expect(row.voteAverage).toBeNull();
    expect(row.voteCount).toBeNull();
  });

  it('throws TvShowConflictError when the tvdb_id unique index is violated', () => {
    createTvShow(db, baseInput());
    expect(() => createTvShow(db, baseInput({ name: 'Duplicate' }))).toThrow(TvShowConflictError);
  });
});

describe('getTvShow', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('returns the persisted row by id', () => {
    const created = createTvShow(db, baseInput());
    expect(getTvShow(db, created.id)).toEqual(created);
  });

  it('throws TvShowNotFoundError when the id is missing', () => {
    expect(() => getTvShow(db, 9_999)).toThrow(TvShowNotFoundError);
  });
});

describe('getTvShowByTvdbId', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('returns the persisted row when present', () => {
    const created = createTvShow(db, baseInput());
    expect(getTvShowByTvdbId(db, 81189)).toEqual(created);
  });

  it('returns null when no row matches', () => {
    expect(getTvShowByTvdbId(db, 999_999)).toBeNull();
  });

  it('does not throw on miss — null is the contract', () => {
    expect(() => getTvShowByTvdbId(db, 1)).not.toThrow();
  });
});

describe('listTvShows', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
    createTvShow(db, baseInput({ tvdbId: 81189, name: 'Breaking Bad', status: 'Ended' }));
    createTvShow(db, baseInput({ tvdbId: 1396, name: 'Better Call Saul', status: 'Ended' }));
    createTvShow(
      db,
      baseInput({
        tvdbId: 60625,
        name: 'Rick and Morty',
        status: 'Returning Series',
        genres: ['Animation', 'Comedy'],
      })
    );
  });

  it('returns rows ordered by name ASC and an accurate total', () => {
    const result = listTvShows(db, {}, 10, 0);
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.name)).toEqual([
      'Better Call Saul',
      'Breaking Bad',
      'Rick and Morty',
    ]);
  });

  it('respects limit + offset for pagination', () => {
    const result = listTvShows(db, {}, 1, 1);
    expect(result.total).toBe(3);
    expect(result.rows.map((r) => r.name)).toEqual(['Breaking Bad']);
  });

  it('filters by name LIKE when `search` is set', () => {
    const result = listTvShows(db, { search: 'Rick' }, 10, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.name).toBe('Rick and Morty');
  });

  it('filters by exact status equality', () => {
    const result = listTvShows(db, { status: 'Returning Series' }, 10, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.name).toBe('Rick and Morty');
  });

  it('combines `search` and `status` with AND', () => {
    const result = listTvShows(db, { search: 'Bre', status: 'Ended' }, 10, 0);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.name).toBe('Breaking Bad');

    const empty = listTvShows(db, { search: 'Bre', status: 'Returning Series' }, 10, 0);
    expect(empty.total).toBe(0);
    expect(empty.rows).toHaveLength(0);
  });
});

describe('updateTvShow', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('updates the supplied fields and re-reads the row', () => {
    const created = createTvShow(db, baseInput());
    const updated = updateTvShow(db, created.id, {
      name: 'Breaking Bad (Remastered)',
      numberOfSeasons: 5,
    });
    expect(updated.name).toBe('Breaking Bad (Remastered)');
    expect(updated.numberOfSeasons).toBe(5);
    expect(updated.tvdbId).toBe(81189);
  });

  it('round-trips genres + networks through JSON.stringify', () => {
    const created = createTvShow(db, baseInput());
    const updated = updateTvShow(db, created.id, {
      genres: ['Drama'],
      networks: ['Netflix'],
    });
    expect(updated.genres).toBe(JSON.stringify(['Drama']));
    expect(updated.networks).toBe(JSON.stringify(['Netflix']));
  });

  it('treats `null` on optional fields as a clear, not a skip', () => {
    const created = createTvShow(db, baseInput({ overview: 'A chemistry teacher…' }));
    const updated = updateTvShow(db, created.id, { overview: null });
    expect(updated.overview).toBeNull();
  });

  it('skips the UPDATE entirely when no fields are supplied (no-op patch)', () => {
    const created = createTvShow(db, baseInput());
    const updated = updateTvShow(db, created.id, {});
    expect(updated.updatedAt).toBe(created.updatedAt);
    expect(updated).toEqual(created);
  });

  it('bumps updated_at when any field is touched', () => {
    const created = createTvShow(db, baseInput());
    const updated = updateTvShow(db, created.id, { name: 'New name' });
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it('throws TvShowNotFoundError when the id is missing', () => {
    expect(() => updateTvShow(db, 9_999, { name: 'x' })).toThrow(TvShowNotFoundError);
  });
});

describe('deleteTvShow', () => {
  let db: MediaDb;
  beforeEach(() => {
    ({ db } = freshDb());
  });

  it('removes the row and a subsequent get throws TvShowNotFoundError', () => {
    const created = createTvShow(db, baseInput());
    deleteTvShow(db, created.id);
    expect(() => getTvShow(db, created.id)).toThrow(TvShowNotFoundError);
  });

  it('throws TvShowNotFoundError when the id is missing', () => {
    expect(() => deleteTvShow(db, 9_999)).toThrow(TvShowNotFoundError);
  });
});
