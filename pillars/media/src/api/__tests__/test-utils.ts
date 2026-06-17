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
  };
}
