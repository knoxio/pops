/**
 * Supertest-backed REST client for the core pillar integration tests.
 *
 * Preserves a caller-shaped API (`client.entities.create({...})`,
 * `client.entities.list()`) so per-test bodies stay readable — only the
 * transport changed. Non-2xx responses throw `HttpError` carrying the
 * parsed `{ status, body }` so tests assert on
 * `.rejects.toMatchObject({ status })`.
 */
import supertest from 'supertest';

import type { Express } from 'express';

import type { Entity } from '../modules/entities/types.js';

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

export interface EntityQuery {
  search?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export function makeClient(app: Express) {
  const r = supertest(app);
  return {
    entities: {
      list: (query: EntityQuery = {}) =>
        send<{ data: Entity[]; pagination: Pagination }>(r.get('/entities').query(query)),
      get: (id: string) => send<{ data: Entity }>(r.get(`/entities/${id}`)),
      create: (body: Record<string, unknown>) =>
        send<{ data: Entity; message: string }>(r.post('/entities').send(body)),
      update: (id: string, data: Record<string, unknown>) =>
        send<{ data: Entity; message: string }>(r.patch(`/entities/${id}`).send(data)),
      delete: (id: string) => send<{ message: string }>(r.delete(`/entities/${id}`)),
    },
  };
}
