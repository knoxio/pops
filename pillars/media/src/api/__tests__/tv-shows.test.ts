/**
 * Integration tests for the `tv-shows.*` REST surface (shows + nested
 * seasons & episodes) via supertest. Covers the wire envelopes, the computed
 * image URLs (incl. the TMDB-CDN season poster), genres/networks JSON
 * round-trip, FK parent validation, conflict + 404 mapping, and pagination.
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
let tvdbSeq = 7000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-tv-test-'));
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

function nextTvdb(): number {
  tvdbSeq += 1;
  return tvdbSeq;
}

async function makeShow(extra: Record<string, unknown> = {}) {
  return (await client().tvShows.create({ tvdbId: nextTvdb(), name: 'The Expanse', ...extra }))
    .data;
}

describe('tv-shows — show CRUD', () => {
  it('creates a show, round-trips genres/networks, computes URLs, reads it back', async () => {
    const tvdbId = nextTvdb();
    const created = await client().tvShows.create({
      tvdbId,
      name: 'Severance',
      genres: ['Drama', 'Sci-Fi'],
      networks: ['Apple TV+'],
      posterPath: '/p.jpg',
      backdropPath: '/b.jpg',
      logoPath: '/l.png',
    });
    expect(created.data.genres).toEqual(['Drama', 'Sci-Fi']);
    expect(created.data.networks).toEqual(['Apple TV+']);
    expect(created.data.posterUrl).toBe(`/media/images/tv/${tvdbId}/poster.jpg`);
    expect(created.data.backdropUrl).toBe(`/media/images/tv/${tvdbId}/backdrop.jpg`);
    expect(created.data.logoUrl).toBe(`/media/images/tv/${tvdbId}/logo.png`);

    const fetched = await client().tvShows.get(created.data.id);
    expect(fetched.data.name).toBe('Severance');
  });

  it('lists, updates, deletes', async () => {
    const show = await makeShow();
    const listed = await client().tvShows.list();
    expect(listed.pagination.total).toBe(1);

    const updated = await client().tvShows.update(show.id, { status: 'Ended' });
    expect(updated.data.status).toBe('Ended');

    expect((await client().tvShows.delete(show.id)).message).toBe('TV show deleted');
    expect((await client().tvShows.list()).pagination.total).toBe(0);
  });

  it('404s unknown get/update/delete and 409s a duplicate tvdbId', async () => {
    await expect(client().tvShows.get(999999)).rejects.toMatchObject({ status: 404 });
    await expect(client().tvShows.update(999999, { name: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    const tvdbId = nextTvdb();
    await client().tvShows.create({ tvdbId, name: 'Dup' });
    await expect(client().tvShows.create({ tvdbId, name: 'Dup2' })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('tv-shows — seasons', () => {
  it('creates, lists, deletes seasons under a show', async () => {
    const show = await makeShow();
    const s1 = await client().tvShows.createSeason(show.id, {
      tvdbId: nextTvdb(),
      seasonNumber: 1,
    });
    expect(s1.data.tvShowId).toBe(show.id);
    expect(s1.message).toBe('Season created');

    const seasons = await client().tvShows.listSeasons(show.id);
    expect(seasons.total).toBe(1);
    expect(seasons.data[0]?.seasonNumber).toBe(1);

    expect((await client().tvShows.deleteSeason(s1.data.id)).message).toBe('Season deleted');
  });

  it('resolves the season poster to the TMDB CDN', async () => {
    const show = await makeShow();
    const season = await client().tvShows.createSeason(show.id, {
      tvdbId: nextTvdb(),
      seasonNumber: 2,
      posterPath: '/abc.jpg',
    });
    expect(season.data.posterUrl).toBe('https://image.tmdb.org/t/p/w600_and_h900_bestv2/abc.jpg');
  });

  it('404s listing/creating seasons under a missing show, 409s a duplicate season number', async () => {
    await expect(client().tvShows.listSeasons(999999)).rejects.toMatchObject({ status: 404 });
    await expect(
      client().tvShows.createSeason(999999, { tvdbId: nextTvdb(), seasonNumber: 1 })
    ).rejects.toMatchObject({ status: 404 });

    const show = await makeShow();
    await client().tvShows.createSeason(show.id, { tvdbId: nextTvdb(), seasonNumber: 1 });
    await expect(
      client().tvShows.createSeason(show.id, { tvdbId: nextTvdb(), seasonNumber: 1 })
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('tv-shows — episodes', () => {
  it('creates, lists, deletes episodes under a season', async () => {
    const show = await makeShow();
    const season = await client().tvShows.createSeason(show.id, {
      tvdbId: nextTvdb(),
      seasonNumber: 1,
    });
    const ep = await client().tvShows.createEpisode(season.data.id, {
      tvdbId: nextTvdb(),
      episodeNumber: 1,
      name: 'Pilot',
    });
    expect(ep.data.seasonId).toBe(season.data.id);
    expect(ep.data.name).toBe('Pilot');

    const episodes = await client().tvShows.listEpisodes(season.data.id);
    expect(episodes.total).toBe(1);

    expect((await client().tvShows.deleteEpisode(ep.data.id)).message).toBe('Episode deleted');
  });

  it('404s episodes under a missing season', async () => {
    await expect(client().tvShows.listEpisodes(999999)).rejects.toMatchObject({ status: 404 });
    await expect(
      client().tvShows.createEpisode(999999, { tvdbId: nextTvdb(), episodeNumber: 1 })
    ).rejects.toMatchObject({ status: 404 });
  });
});
