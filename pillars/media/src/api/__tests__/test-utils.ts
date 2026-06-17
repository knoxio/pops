/**
 * Supertest-backed REST client for the media integration tests.
 *
 * Preserves a caller-shaped API (`client.movies.create({...})`,
 * `client.movies.list()`) so per-test bodies stay readable — only the
 * transport changed. Non-2xx responses throw `HttpError` with the parsed
 * `{ status, body }` so tests assert on `.rejects.toMatchObject({ status })`.
 */
import supertest from 'supertest';

import type { Express } from 'express';

import type { Movie } from '../modules/movie-types.js';
import type { Episode, Season, TvShow } from '../modules/tv-show-types.js';
import type { WatchlistEntry } from '../modules/watchlist-types.js';

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    const message =
      body !== null && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${status}`;
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

async function send<T>(req: supertest.Test): Promise<T> {
  const res = await req;
  if (res.status >= 200 && res.status < 300) return res.body as T;
  throw new HttpError(res.status, res.body);
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface MovieQuery {
  search?: string;
  genre?: string;
  limit?: number;
  offset?: number;
}

export interface WatchlistQuery {
  mediaType?: 'movie' | 'tv_show';
  limit?: number;
  offset?: number;
}

export function makeClient(app: Express) {
  const r = supertest(app);
  return {
    movies: {
      list: (query: MovieQuery = {}) =>
        send<{ data: Movie[]; pagination: Pagination }>(r.get('/movies').query(query)),
      get: (id: number) => send<{ data: Movie }>(r.get(`/movies/${id}`)),
      create: (body: Record<string, unknown>) =>
        send<{ data: Movie; message: string }>(r.post('/movies').send(body)),
      update: (id: number, data: Record<string, unknown>) =>
        send<{ data: Movie; message: string }>(r.patch(`/movies/${id}`).send(data)),
      delete: (id: number) => send<{ message: string }>(r.delete(`/movies/${id}`)),
    },
    tvShows: {
      list: (query: { search?: string; status?: string; limit?: number; offset?: number } = {}) =>
        send<{ data: TvShow[]; pagination: Pagination }>(r.get('/tv-shows').query(query)),
      get: (id: number) => send<{ data: TvShow }>(r.get(`/tv-shows/${id}`)),
      create: (body: Record<string, unknown>) =>
        send<{ data: TvShow; message: string }>(r.post('/tv-shows').send(body)),
      update: (id: number, data: Record<string, unknown>) =>
        send<{ data: TvShow; message: string }>(r.patch(`/tv-shows/${id}`).send(data)),
      delete: (id: number) => send<{ message: string }>(r.delete(`/tv-shows/${id}`)),
      listSeasons: (tvShowId: number) =>
        send<{ data: Season[]; total: number }>(r.get(`/tv-shows/${tvShowId}/seasons`)),
      createSeason: (tvShowId: number, body: Record<string, unknown>) =>
        send<{ data: Season; message: string }>(r.post(`/tv-shows/${tvShowId}/seasons`).send(body)),
      deleteSeason: (id: number) => send<{ message: string }>(r.delete(`/seasons/${id}`)),
      listEpisodes: (seasonId: number) =>
        send<{ data: Episode[]; total: number }>(r.get(`/seasons/${seasonId}/episodes`)),
      createEpisode: (seasonId: number, body: Record<string, unknown>) =>
        send<{ data: Episode; message: string }>(
          r.post(`/seasons/${seasonId}/episodes`).send(body)
        ),
      deleteEpisode: (id: number) => send<{ message: string }>(r.delete(`/episodes/${id}`)),
    },
    watchlist: {
      list: (query: WatchlistQuery = {}) =>
        send<{ data: WatchlistEntry[]; pagination: Pagination }>(r.get('/watchlist').query(query)),
      status: (query: { mediaType: string; mediaId: number }) =>
        send<{ onWatchlist: boolean; entryId: number | null }>(
          r.get('/watchlist/status').query(query)
        ),
      get: (id: number) => send<{ data: WatchlistEntry }>(r.get(`/watchlist/${id}`)),
      add: (body: Record<string, unknown>) =>
        send<{ data: WatchlistEntry; created: boolean; message: string }>(
          r.post('/watchlist').send(body)
        ),
      reorder: (items: { id: number; priority: number }[]) =>
        send<{ message: string }>(r.post('/watchlist/reorder').send({ items })),
      update: (id: number, data: Record<string, unknown>) =>
        send<{ data: WatchlistEntry; message: string }>(r.patch(`/watchlist/${id}`).send(data)),
      remove: (id: number) => send<{ message: string }>(r.delete(`/watchlist/${id}`)),
    },
    shelfImpressions: {
      record: (shelfIds: string[]) =>
        send<{ ok: true; recorded: number }>(r.post('/shelf-impressions').send({ shelfIds })),
      recent: (query: { days?: number } = {}) =>
        send<{ windowDays: number; entries: { shelfId: string; impressionCount: number }[] }>(
          r.get('/shelf-impressions/recent').query(query)
        ),
      freshness: (query: { shelfId: string; days?: number }) =>
        send<{ shelfId: string; impressionCount: number; freshness: number }>(
          r.get('/shelf-impressions/freshness').query(query)
        ),
      cleanup: () => send<{ ok: true }>(r.post('/shelf-impressions/cleanup').send({})),
    },
  };
}
