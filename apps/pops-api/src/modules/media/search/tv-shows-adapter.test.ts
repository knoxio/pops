import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent side-effect registration from throwing on import
vi.mock('../../core/search/registry.js', () => ({
  registerSearchAdapter: vi.fn(),
  getAdapters: vi.fn(),
  resetRegistry: vi.fn(),
}));

import { seedTvShow, setupTestContext } from '../../../shared/test-utils.js';
import { registerSearchAdapter } from '../../core/search/registry.js';
import type { SearchContext } from '../../core/search/types.js';
import { tvShowsSearchAdapter } from './tv-shows-adapter.js';

const ctx = setupTestContext();
let db: Database;

const defaultContext: SearchContext = { app: 'media', page: 'search' };

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

describe('tvShowsSearchAdapter', () => {
  it('has correct domain, icon, and color', () => {
    expect(tvShowsSearchAdapter.domain).toBe('tv-shows');
    expect(tvShowsSearchAdapter.icon).toBe('Tv');
    expect(tvShowsSearchAdapter.color).toBe('purple');
    expect(registerSearchAdapter).toHaveBeenCalledWith(tvShowsSearchAdapter);
  });

  it('returns empty array for empty query', async () => {
    seedTvShow(db, { name: 'Breaking Bad', tvdb_id: 81189 });
    const hits = await tvShowsSearchAdapter.search({ text: '' }, defaultContext);
    expect(hits).toEqual([]);
  });

  it('returns empty array for whitespace-only query', async () => {
    seedTvShow(db, { name: 'Breaking Bad', tvdb_id: 81189 });
    const hits = await tvShowsSearchAdapter.search({ text: '   ' }, defaultContext);
    expect(hits).toEqual([]);
  });

  it('returns empty array when no matches', async () => {
    seedTvShow(db, { name: 'Breaking Bad', tvdb_id: 81189 });
    const hits = await tvShowsSearchAdapter.search({ text: 'Stranger Things' }, defaultContext);
    expect(hits).toEqual([]);
  });

  describe('scoring', () => {
    it('scores exact match as 1.0', async () => {
      seedTvShow(db, { name: 'Severance', tvdb_id: 371980 });
      const hits = await tvShowsSearchAdapter.search({ text: 'Severance' }, defaultContext);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.score).toBe(1.0);
      expect(hits[0]!.matchType).toBe('exact');
    });

    it('scores exact match case-insensitively', async () => {
      seedTvShow(db, { name: 'Severance', tvdb_id: 371980 });
      const hits = await tvShowsSearchAdapter.search({ text: 'severance' }, defaultContext);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.score).toBe(1.0);
      expect(hits[0]!.matchType).toBe('exact');
    });

    it('scores prefix match as 0.8', async () => {
      seedTvShow(db, { name: 'Breaking Bad', tvdb_id: 81189 });
      const hits = await tvShowsSearchAdapter.search({ text: 'Breaking' }, defaultContext);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.score).toBe(0.8);
      expect(hits[0]!.matchType).toBe('prefix');
    });

    it('scores contains match as 0.5', async () => {
      seedTvShow(db, { name: 'Breaking Bad', tvdb_id: 81189 });
      const hits = await tvShowsSearchAdapter.search({ text: 'Bad' }, defaultContext);
      expect(hits).toHaveLength(1);
      expect(hits[0]!.score).toBe(0.5);
      expect(hits[0]!.matchType).toBe('contains');
    });

    it('sorts results by score descending', async () => {
      seedTvShow(db, { name: 'Shogun', tvdb_id: 1001 });
      seedTvShow(db, { name: 'The Shogun', tvdb_id: 1002 });
      seedTvShow(db, { name: 'Shogunate', tvdb_id: 1003 });

      const hits = await tvShowsSearchAdapter.search({ text: 'Shogun' }, defaultContext);
      expect(hits).toHaveLength(3);
      expect(hits[0]!.score).toBe(1.0); // exact: "Shogun"
      expect(hits[1]!.score).toBe(0.8); // prefix: "Shogunate"
      expect(hits[2]!.score).toBe(0.5); // contains: "The Shogun"
    });
  });

  describe('hit data', () => {
    it('returns correct hit fields', async () => {
      seedTvShow(db, {
        name: 'Breaking Bad',
        tvdb_id: 81189,
        first_air_date: '2008-01-20',
        status: 'Ended',
        number_of_seasons: 5,
        vote_average: 9.5,
      });

      const hits = await tvShowsSearchAdapter.search({ text: 'Breaking Bad' }, defaultContext);
      expect(hits).toHaveLength(1);
      const hit = hits[0]!;
      expect(hit.matchField).toBe('name');
      expect(hit.data).toEqual({
        name: 'Breaking Bad',
        year: '2008',
        posterUrl: '/media/images/tv/81189/poster.jpg',
        status: 'Ended',
        numberOfSeasons: 5,
        voteAverage: 9.5,
      });
    });

    it('returns correct URI format', async () => {
      const id = seedTvShow(db, { name: 'Severance', tvdb_id: 371980 });
      const hits = await tvShowsSearchAdapter.search({ text: 'Severance' }, defaultContext);
      expect(hits[0]!.uri).toBe(`pops:media/tv-show/${id}`);
    });

    it('handles null firstAirDate as null year', async () => {
      seedTvShow(db, { name: 'Unknown Show', tvdb_id: 5555, first_air_date: null });
      const hits = await tvShowsSearchAdapter.search({ text: 'Unknown Show' }, defaultContext);
      expect(hits[0]!.data.year).toBeNull();
    });

    it('handles null optional fields', async () => {
      seedTvShow(db, {
        name: 'Minimal Show',
        tvdb_id: 7777,
        status: null,
        number_of_seasons: null,
        vote_average: null,
      });
      const hits = await tvShowsSearchAdapter.search({ text: 'Minimal Show' }, defaultContext);
      expect(hits[0]!.data.status).toBeNull();
      expect(hits[0]!.data.numberOfSeasons).toBeNull();
      expect(hits[0]!.data.voteAverage).toBeNull();
    });

    it('builds poster URL from tvdbId', async () => {
      seedTvShow(db, { name: 'Shogun', tvdb_id: 392256 });
      const hits = await tvShowsSearchAdapter.search({ text: 'Shogun' }, defaultContext);
      expect(hits[0]!.data.posterUrl).toBe('/media/images/tv/392256/poster.jpg');
    });
  });

  describe('options', () => {
    it('respects limit option', async () => {
      for (let i = 0; i < 5; i++) {
        seedTvShow(db, { name: `Show ${i}`, tvdb_id: 10000 + i });
      }
      const hits = await tvShowsSearchAdapter.search({ text: 'Show' }, defaultContext, {
        limit: 3,
      });
      expect(hits).toHaveLength(3);
    });

    it('defaults limit to 20', async () => {
      for (let i = 0; i < 25; i++) {
        seedTvShow(db, { name: `Show ${i}`, tvdb_id: 10000 + i });
      }
      const hits = await tvShowsSearchAdapter.search({ text: 'Show' }, defaultContext);
      expect(hits).toHaveLength(20);
    });
  });
});
