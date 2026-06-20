/**
 * Integration tests for the read-only `library.*` REST surface via supertest:
 * the combined movies + TV-shows grid (filter / sort / page-based pagination),
 * the distinct-genre list, and the unwatched-movie quick pick.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let mediaDb: OpenedMediaDb;
let seq = 9000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-library-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createMediaApiApp({ mediaDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3003' })
  );
}

function nextId(): number {
  seq += 1;
  return seq;
}

async function seedMovie(title: string, extra: Record<string, unknown> = {}) {
  return (await client().movies.create({ tmdbId: nextId(), title, ...extra })).data;
}

async function seedTvShow(name: string, extra: Record<string, unknown> = {}) {
  return (await client().tvShows.create({ tvdbId: nextId(), name, ...extra })).data;
}

describe('library — list', () => {
  it('unions movies + tv shows with computed poster URLs and parsed genres', async () => {
    const movie = await seedMovie('Heat', {
      genres: ['Crime'],
      posterPath: '/heat.jpg',
      releaseDate: '1995-12-15',
    });
    await seedTvShow('Fargo', { genres: ['Crime', 'Drama'], posterPath: '/fargo.jpg' });

    const listed = await client().library.list();
    expect(listed.pagination.total).toBe(2);
    const movieItem = listed.data.find((i) => i.type === 'movie');
    expect(movieItem?.title).toBe('Heat');
    expect(movieItem?.year).toBe(1995);
    expect(movieItem?.posterUrl).toBe(`/media/images/movie/${movie.tmdbId}/poster.jpg`);
    expect(movieItem?.cdnPosterUrl).toBe('https://image.tmdb.org/t/p/w342/heat.jpg');
    expect(movieItem?.genres).toEqual(['Crime']);
  });

  it('filters by type and by genre', async () => {
    await seedMovie('Sicario', { genres: ['Thriller'] });
    await seedTvShow('Chernobyl', { genres: ['Drama'] });

    const onlyTv = await client().library.list({ type: 'tv' });
    expect(onlyTv.data.every((i) => i.type === 'tv')).toBe(true);

    const thriller = await client().library.list({ genre: 'Thriller' });
    expect(thriller.data.map((i) => i.title)).toEqual(['Sicario']);
  });

  it('paginates with page/pageSize and reports totalPages + hasMore', async () => {
    for (const t of ['a', 'b', 'c']) await seedMovie(t);
    const page1 = await client().library.list({ pageSize: 2, page: 1 });
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination).toMatchObject({ total: 3, totalPages: 2, hasMore: true, page: 1 });

    const page2 = await client().library.list({ pageSize: 2, page: 2 });
    expect(page2.data).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
  });
});

describe('library — genres', () => {
  it('returns the distinct, sorted union of genres', async () => {
    await seedMovie('A', { genres: ['Sci-Fi', 'Drama'] });
    await seedTvShow('B', { genres: ['Drama', 'Comedy'] });
    const { data } = await client().library.genres();
    expect(data).toEqual(['Comedy', 'Drama', 'Sci-Fi']);
  });
});

describe('library — quickPick', () => {
  it('returns unwatched movies and excludes completed ones', async () => {
    const watched = await seedMovie('Watched');
    await seedMovie('Unwatched');
    await client().watchHistory.log({ mediaType: 'movie', mediaId: watched.id, completed: 1 });

    const { data } = await client().library.quickPick({ count: 10 });
    const titles = data.map((m) => m.title);
    expect(titles).toContain('Unwatched');
    expect(titles).not.toContain('Watched');
  });

  it('honours the count cap', async () => {
    for (let i = 0; i < 5; i++) await seedMovie(`m${i}`);
    const { data } = await client().library.quickPick({ count: 3 });
    expect(data).toHaveLength(3);
  });
});
