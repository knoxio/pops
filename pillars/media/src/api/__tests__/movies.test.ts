/**
 * Integration tests for the `movies.*` REST surface, driven through the real
 * Express app via supertest. Service-layer invariants are covered in the db
 * package tests; this suite focuses on the wire contract: envelope shapes,
 * the computed image URLs, genres JSON round-tripping, error-status mapping,
 * and pagination metadata.
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
let tmdbSeq = 1000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-movies-test-'));
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

/** Each test needs a unique tmdbId (the natural key is UNIQUE). */
function nextTmdb(): number {
  tmdbSeq += 1;
  return tmdbSeq;
}

describe('movies — happy paths', () => {
  it('creates a movie, round-trips genres, and reads it back', async () => {
    const tmdbId = nextTmdb();
    const created = await client().movies.create({
      tmdbId,
      title: 'Blade Runner 2049',
      genres: ['Sci-Fi', 'Drama'],
      releaseDate: '2017-10-06',
    });
    expect(created.data.id).toBeGreaterThan(0);
    expect(created.data.tmdbId).toBe(tmdbId);
    expect(created.data.genres).toEqual(['Sci-Fi', 'Drama']);
    expect(created.message).toBe('Movie created');

    const fetched = await client().movies.get(created.data.id);
    expect(fetched.data).toMatchObject({ title: 'Blade Runner 2049', tmdbId });
  });

  it('computes poster/backdrop/logo URLs from the cached paths', async () => {
    const tmdbId = nextTmdb();
    const created = await client().movies.create({
      tmdbId,
      title: 'Dune',
      posterPath: '/poster.jpg',
      backdropPath: '/backdrop.jpg',
      logoPath: '/logo.png',
    });
    expect(created.data.posterUrl).toBe(`/media/images/movie/${tmdbId}/poster.jpg`);
    expect(created.data.backdropUrl).toBe(`/media/images/movie/${tmdbId}/backdrop.jpg`);
    expect(created.data.logoUrl).toBe(`/media/images/movie/${tmdbId}/logo.png`);
  });

  it('prefers a poster override path over the cached route URL', async () => {
    const created = await client().movies.create({
      tmdbId: nextTmdb(),
      title: 'Arrival',
      posterPath: '/poster.jpg',
      posterOverridePath: '/uploads/arrival.jpg',
    });
    expect(created.data.posterUrl).toBe('/uploads/arrival.jpg');
  });

  it('leaves image URLs null when no paths are set', async () => {
    const created = await client().movies.create({ tmdbId: nextTmdb(), title: 'Sicario' });
    expect(created.data.posterUrl).toBeNull();
    expect(created.data.backdropUrl).toBeNull();
    expect(created.data.logoUrl).toBeNull();
    expect(created.data.genres).toEqual([]);
  });

  it('lists, updates, then deletes a movie', async () => {
    const created = await client().movies.create({ tmdbId: nextTmdb(), title: 'Tenet' });

    const listed = await client().movies.list();
    expect(listed.data.map((m) => m.title)).toContain('Tenet');
    expect(listed.pagination.total).toBe(1);

    const updated = await client().movies.update(created.data.id, { title: 'Tenet (2020)' });
    expect(updated.data.title).toBe('Tenet (2020)');
    expect(updated.message).toBe('Movie updated');

    const deleted = await client().movies.delete(created.data.id);
    expect(deleted.message).toBe('Movie deleted');

    const after = await client().movies.list();
    expect(after.data).toHaveLength(0);
  });
});

describe('movies — filters & pagination', () => {
  it('filters by a search term', async () => {
    await client().movies.create({ tmdbId: nextTmdb(), title: 'The Matrix' });
    await client().movies.create({ tmdbId: nextTmdb(), title: 'Interstellar' });

    const matched = await client().movies.list({ search: 'Matrix' });
    expect(matched.data.map((m) => m.title)).toEqual(['The Matrix']);
  });

  it('honours limit/offset and reports hasMore', async () => {
    for (const title of ['a', 'b', 'c']) {
      await client().movies.create({ tmdbId: nextTmdb(), title });
    }
    const page = await client().movies.list({ limit: 2, offset: 0 });
    expect(page.data).toHaveLength(2);
    expect(page.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });

    const last = await client().movies.list({ limit: 2, offset: 2 });
    expect(last.data).toHaveLength(1);
    expect(last.pagination.hasMore).toBe(false);
  });
});

describe('movies — error mapping', () => {
  it('404s an unknown get / update / delete', async () => {
    await expect(client().movies.get(999999)).rejects.toMatchObject({ status: 404 });
    await expect(client().movies.update(999999, { title: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().movies.delete(999999)).rejects.toMatchObject({ status: 404 });
  });

  it('400s an empty title at the contract boundary', async () => {
    await expect(client().movies.create({ tmdbId: nextTmdb(), title: '' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('409s a duplicate tmdbId', async () => {
    const tmdbId = nextTmdb();
    await client().movies.create({ tmdbId, title: 'Original' });
    await expect(client().movies.create({ tmdbId, title: 'Duplicate' })).rejects.toMatchObject({
      status: 409,
    });
  });
});
