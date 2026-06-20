/**
 * Integration tests for the `watch-history.*` REST surface via supertest.
 *
 * Covers: list/get passthrough + pagination, the recent-history enrichment
 * for both a movie and an episode, single-show progress math (per-season +
 * overall + next-unwatched pointer), batch progress (incl. omission of shows
 * with no episodes), log with watchlist auto-removal (movie + fully-watched
 * show), batch-log season/show expansion with aired-only filtering and
 * already-watched skipping, delete, the 404 mapping, and contract-boundary
 * 400s. Also asserts the comparison-staleness reset on completion (movie →
 * itself, episode → parent show; not reset when `completed = 0`).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { comparisonsService, openMediaDb, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let mediaDb: OpenedMediaDb;
let idSeq = 9000;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-wh-test-'));
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
  idSeq += 1;
  return idSeq;
}

const PAST = '2024-01-01';
const FUTURE = '2999-01-01';

async function makeMovie(extra: Record<string, unknown> = {}) {
  return (await client().movies.create({ tmdbId: nextId(), title: 'Dune', ...extra })).data;
}

async function makeShow(extra: Record<string, unknown> = {}) {
  return (await client().tvShows.create({ tvdbId: nextId(), name: 'The Wire', ...extra })).data;
}

async function makeSeason(tvShowId: number, seasonNumber: number) {
  return (await client().tvShows.createSeason(tvShowId, { tvdbId: nextId(), seasonNumber })).data;
}

async function makeEpisode(
  seasonId: number,
  episodeNumber: number,
  extra: Record<string, unknown> = {}
) {
  return (
    await client().tvShows.createEpisode(seasonId, { tvdbId: nextId(), episodeNumber, ...extra })
  ).data;
}

describe('watch-history — list / get / delete', () => {
  it('logs, lists (newest first), reads back, and deletes', async () => {
    const movie = await makeMovie();
    const logged = await client().watchHistory.log({
      mediaType: 'movie',
      mediaId: movie.id,
      watchedAt: '2024-05-01T10:00:00.000Z',
    });
    expect(logged.data).toMatchObject({ mediaType: 'movie', mediaId: movie.id, completed: 1 });
    expect(logged.message).toBe('Watch logged');

    const listed = await client().watchHistory.list();
    expect(listed.pagination.total).toBe(1);
    expect(listed.data[0]?.id).toBe(logged.data.id);

    const fetched = await client().watchHistory.get(logged.data.id);
    expect(fetched.data.id).toBe(logged.data.id);

    expect((await client().watchHistory.delete(logged.data.id)).message).toBe(
      'Watch history entry deleted'
    );
    expect((await client().watchHistory.list()).pagination.total).toBe(0);
  });

  it('filters list by mediaType and mediaId', async () => {
    const movie = await makeMovie();
    await client().watchHistory.log({
      mediaType: 'movie',
      mediaId: movie.id,
      watchedAt: '2024-05-01T10:00:00.000Z',
    });
    await client().watchHistory.log({
      mediaType: 'movie',
      mediaId: movie.id + 1,
      watchedAt: '2024-05-02T10:00:00.000Z',
    });

    const byId = await client().watchHistory.list({ mediaType: 'movie', mediaId: movie.id });
    expect(byId.pagination.total).toBe(1);
    expect(byId.data[0]?.mediaId).toBe(movie.id);
  });

  it('404s an unknown get and delete', async () => {
    await expect(client().watchHistory.get(123456)).rejects.toMatchObject({ status: 404 });
    await expect(client().watchHistory.delete(123456)).rejects.toMatchObject({ status: 404 });
  });
});

describe('watch-history — recent enrichment', () => {
  it('enriches a movie watch with title + poster url', async () => {
    const movie = await makeMovie({ title: 'Arrival', posterPath: '/p.jpg' });
    await client().watchHistory.log({
      mediaType: 'movie',
      mediaId: movie.id,
      watchedAt: '2024-06-01T10:00:00.000Z',
    });

    const recent = await client().watchHistory.listRecent({ mediaType: 'movie' });
    expect(recent.data).toHaveLength(1);
    expect(recent.data[0]).toMatchObject({
      title: 'Arrival',
      posterUrl: `/media/images/movie/${movie.tmdbId}/poster.jpg`,
      seasonNumber: null,
      tvShowId: null,
    });
  });

  it('enriches an episode watch with show name, season/episode numbers, and show poster url', async () => {
    const show = await makeShow({ name: 'Severance', posterPath: '/s.jpg' });
    const season = await makeSeason(show.id, 3);
    const episode = await makeEpisode(season.id, 7, { name: 'Pilot', airDate: PAST });
    await client().watchHistory.log({
      mediaType: 'episode',
      mediaId: episode.id,
      watchedAt: '2024-06-02T10:00:00.000Z',
    });

    const recent = await client().watchHistory.listRecent({ mediaType: 'episode' });
    expect(recent.data[0]).toMatchObject({
      title: 'Pilot',
      showName: 'Severance',
      seasonNumber: 3,
      episodeNumber: 7,
      tvShowId: show.id,
      posterUrl: `/media/images/tv/${show.tvdbId}/poster.jpg`,
    });
  });
});

describe('watch-history — progress', () => {
  it('computes per-season + overall progress and the next unwatched episode', async () => {
    const show = await makeShow();
    const s1 = await makeSeason(show.id, 1);
    const e1 = await makeEpisode(s1.id, 1, { name: 'One', airDate: PAST });
    const e2 = await makeEpisode(s1.id, 2, { name: 'Two', airDate: PAST });
    const s2 = await makeSeason(show.id, 2);
    await makeEpisode(s2.id, 1, { name: 'Three', airDate: PAST });

    await client().watchHistory.log({
      mediaType: 'episode',
      mediaId: e1.id,
      watchedAt: '2024-07-01T10:00:00.000Z',
    });

    const { data } = await client().watchHistory.progress(show.id);
    expect(data.tvShowId).toBe(show.id);
    expect(data.overall).toEqual({ watched: 1, total: 3, percentage: 33 });
    const season1 = data.seasons.find((s) => s.seasonNumber === 1);
    expect(season1).toMatchObject({ watched: 1, total: 2, percentage: 50 });
    expect(data.nextEpisode).toEqual({ seasonNumber: 1, episodeNumber: 2, episodeName: 'Two' });
    void e2;
  });

  it('404s progress for an unknown show', async () => {
    await expect(client().watchHistory.progress(987654)).rejects.toMatchObject({ status: 404 });
  });

  it('reports 100% and a null next episode once every episode is watched', async () => {
    const show = await makeShow();
    const s1 = await makeSeason(show.id, 1);
    const e1 = await makeEpisode(s1.id, 1, { airDate: PAST });
    await client().watchHistory.log({
      mediaType: 'episode',
      mediaId: e1.id,
      watchedAt: '2024-07-02T10:00:00.000Z',
    });
    const { data } = await client().watchHistory.progress(show.id);
    expect(data.overall.percentage).toBe(100);
    expect(data.nextEpisode).toBeNull();
  });
});

describe('watch-history — batch progress', () => {
  it('returns a percentage per show with episodes and omits shows without any', async () => {
    const showA = await makeShow();
    const sa = await makeSeason(showA.id, 1);
    const ea1 = await makeEpisode(sa.id, 1, { airDate: PAST });
    await makeEpisode(sa.id, 2, { airDate: PAST });
    await client().watchHistory.log({
      mediaType: 'episode',
      mediaId: ea1.id,
      watchedAt: '2024-08-01T10:00:00.000Z',
    });

    const showB = await makeShow();

    const { data } = await client().watchHistory.batchProgress([showA.id, showB.id]);
    expect(data).toEqual([{ tvShowId: showA.id, percentage: 50 }]);
  });

  it('400s an empty tvShowIds list at the contract boundary', async () => {
    await expect(client().watchHistory.batchProgress([])).rejects.toMatchObject({ status: 400 });
  });
});

describe('watch-history — log side effects', () => {
  it('removes a movie from the watchlist when logged as completed', async () => {
    const movie = await makeMovie();
    await client().watchlist.add({ mediaType: 'movie', mediaId: movie.id });

    const logged = await client().watchHistory.log({
      mediaType: 'movie',
      mediaId: movie.id,
      watchedAt: '2024-09-01T10:00:00.000Z',
    });
    expect(logged.watchlistRemoved).toBe(true);

    const status = await client().watchlist.status({ mediaType: 'movie', mediaId: movie.id });
    expect(status.onWatchlist).toBe(false);
  });

  it('does NOT remove the movie when source is plex_sync', async () => {
    const movie = await makeMovie();
    await client().watchlist.add({ mediaType: 'movie', mediaId: movie.id });
    const logged = await client().watchHistory.log({
      mediaType: 'movie',
      mediaId: movie.id,
      watchedAt: '2024-09-02T10:00:00.000Z',
      source: 'plex_sync',
    });
    expect(logged.watchlistRemoved).toBe(false);
    const status = await client().watchlist.status({ mediaType: 'movie', mediaId: movie.id });
    expect(status.onWatchlist).toBe(true);
  });

  it('removes the show from the watchlist once its last episode is logged', async () => {
    const show = await makeShow();
    const s1 = await makeSeason(show.id, 1);
    const e1 = await makeEpisode(s1.id, 1, { airDate: PAST });
    await client().watchlist.add({ mediaType: 'tv_show', mediaId: show.id });

    const logged = await client().watchHistory.log({
      mediaType: 'episode',
      mediaId: e1.id,
      watchedAt: '2024-09-03T10:00:00.000Z',
    });
    expect(logged.watchlistRemoved).toBe(true);
    const status = await client().watchlist.status({ mediaType: 'tv_show', mediaId: show.id });
    expect(status.onWatchlist).toBe(false);
  });

  it('keeps the show on the watchlist while episodes remain unwatched', async () => {
    const show = await makeShow();
    const s1 = await makeSeason(show.id, 1);
    const e1 = await makeEpisode(s1.id, 1, { airDate: PAST });
    await makeEpisode(s1.id, 2, { airDate: PAST });
    await client().watchlist.add({ mediaType: 'tv_show', mediaId: show.id });

    const logged = await client().watchHistory.log({
      mediaType: 'episode',
      mediaId: e1.id,
      watchedAt: '2024-09-04T10:00:00.000Z',
    });
    expect(logged.watchlistRemoved).toBe(false);
    const status = await client().watchlist.status({ mediaType: 'tv_show', mediaId: show.id });
    expect(status.onWatchlist).toBe(true);
  });

  it('400s an invalid mediaType at the contract boundary', async () => {
    await expect(
      client().watchHistory.log({ mediaType: 'season', mediaId: 1 })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('watch-history — batch log', () => {
  it('expands a season into aired episodes, skips future-dated ones', async () => {
    const show = await makeShow();
    const s1 = await makeSeason(show.id, 1);
    await makeEpisode(s1.id, 1, { airDate: PAST });
    await makeEpisode(s1.id, 2, { airDate: PAST });
    await makeEpisode(s1.id, 3, { airDate: FUTURE });

    const { data, message } = await client().watchHistory.batchLog({
      mediaType: 'season',
      mediaId: s1.id,
      watchedAt: '2024-10-01T10:00:00.000Z',
    });
    expect(data).toEqual({ logged: 2, skipped: 0 });
    expect(message).toContain('Batch logged 2');

    const progress = await client().watchHistory.progress(show.id);
    expect(progress.data.overall.watched).toBe(2);
  });

  it('skips already-watched episodes on a show-level batch log', async () => {
    const show = await makeShow();
    const s1 = await makeSeason(show.id, 1);
    const e1 = await makeEpisode(s1.id, 1, { airDate: PAST });
    await makeEpisode(s1.id, 2, { airDate: PAST });
    await client().watchHistory.log({
      mediaType: 'episode',
      mediaId: e1.id,
      watchedAt: '2024-10-02T10:00:00.000Z',
    });

    const { data } = await client().watchHistory.batchLog({
      mediaType: 'show',
      mediaId: show.id,
      watchedAt: '2024-10-03T10:00:00.000Z',
    });
    expect(data).toEqual({ logged: 1, skipped: 1 });
  });

  it('removes a fully-watched show from the watchlist after a batch log', async () => {
    const show = await makeShow();
    const s1 = await makeSeason(show.id, 1);
    await makeEpisode(s1.id, 1, { airDate: PAST });
    await makeEpisode(s1.id, 2, { airDate: PAST });
    await client().watchlist.add({ mediaType: 'tv_show', mediaId: show.id });

    await client().watchHistory.batchLog({
      mediaType: 'show',
      mediaId: show.id,
      watchedAt: '2024-10-04T10:00:00.000Z',
    });
    const status = await client().watchlist.status({ mediaType: 'tv_show', mediaId: show.id });
    expect(status.onWatchlist).toBe(false);
  });

  it('returns zero counts when nothing has aired yet', async () => {
    const show = await makeShow();
    const s1 = await makeSeason(show.id, 1);
    await makeEpisode(s1.id, 1, { airDate: FUTURE });
    const { data } = await client().watchHistory.batchLog({
      mediaType: 'season',
      mediaId: s1.id,
      watchedAt: '2024-10-05T10:00:00.000Z',
    });
    expect(data).toEqual({ logged: 0, skipped: 0 });
  });
});

describe('watch-history — comparison staleness reset', () => {
  it('resets a movie to fresh (1.0) once it is logged as completed', async () => {
    const movie = await makeMovie();
    comparisonsService.markStale(mediaDb.db, 'movie', movie.id);
    expect(comparisonsService.getStaleness(mediaDb.db, 'movie', movie.id)).toBeLessThan(1);

    await client().watchHistory.log({
      mediaType: 'movie',
      mediaId: movie.id,
      watchedAt: '2024-11-01T10:00:00.000Z',
      completed: 1,
    });

    expect(comparisonsService.getStaleness(mediaDb.db, 'movie', movie.id)).toBe(1.0);
  });

  it('resets the parent show (not the episode) when an episode is logged as completed', async () => {
    const show = await makeShow();
    const s1 = await makeSeason(show.id, 1);
    const e1 = await makeEpisode(s1.id, 1, { airDate: PAST });

    comparisonsService.markStale(mediaDb.db, 'tv_show', show.id);
    comparisonsService.markStale(mediaDb.db, 'episode', e1.id);
    expect(comparisonsService.getStaleness(mediaDb.db, 'tv_show', show.id)).toBeLessThan(1);

    await client().watchHistory.log({
      mediaType: 'episode',
      mediaId: e1.id,
      watchedAt: '2024-11-02T10:00:00.000Z',
      completed: 1,
    });

    expect(comparisonsService.getStaleness(mediaDb.db, 'tv_show', show.id)).toBe(1.0);
    expect(comparisonsService.getStaleness(mediaDb.db, 'episode', e1.id)).toBeLessThan(1);
  });

  it('does NOT reset staleness when the watch is logged with completed = 0', async () => {
    const movie = await makeMovie();
    const stale = comparisonsService.markStale(mediaDb.db, 'movie', movie.id);

    await client().watchHistory.log({
      mediaType: 'movie',
      mediaId: movie.id,
      watchedAt: '2024-11-03T10:00:00.000Z',
      completed: 0,
    });

    expect(comparisonsService.getStaleness(mediaDb.db, 'movie', movie.id)).toBe(stale);
  });

  it('resets the parent show staleness once after a batch log', async () => {
    const show = await makeShow();
    const s1 = await makeSeason(show.id, 1);
    await makeEpisode(s1.id, 1, { airDate: PAST });
    await makeEpisode(s1.id, 2, { airDate: PAST });
    comparisonsService.markStale(mediaDb.db, 'tv_show', show.id);
    expect(comparisonsService.getStaleness(mediaDb.db, 'tv_show', show.id)).toBeLessThan(1);

    await client().watchHistory.batchLog({
      mediaType: 'show',
      mediaId: show.id,
      watchedAt: '2024-11-04T10:00:00.000Z',
    });

    expect(comparisonsService.getStaleness(mediaDb.db, 'tv_show', show.id)).toBe(1.0);
  });
});
