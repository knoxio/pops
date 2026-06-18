/**
 * Supertest-backed REST client for the inventory integration tests.
 *
 * Preserves the caller-shaped API the old tRPC tests used
 * (`client.items.create({...})`, `client.locations.tree()`) so per-test
 * bodies stay readable — only the transport changed. Non-2xx responses
 * throw `HttpError` with the parsed `{ status, body }` so tests assert on
 * `.rejects.toMatchObject({ status })` instead of the old TRPCError code.
 */
import supertest from 'supertest';

import type { Express } from 'express';

import type { LocationTreeNodeShape } from '../../contract/rest-locations.js';
import type { InventoryItem } from '../modules/items/types.js';
import type { Location } from '../modules/locations/types.js';

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

export interface SearchHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: 'exact' | 'prefix' | 'contains';
  data: Record<string, unknown>;
}

interface ItemEnvelope {
  data: InventoryItem;
  message: string;
}
interface LocationEnvelope {
  data: Location;
  message: string;
}
interface DeleteAck {
  message?: string;
  requiresConfirmation?: boolean;
  stats?: { childCount: number; itemCount: number };
}

export interface ItemCreateBody {
  itemName: string;
  brand?: string | null;
  type?: string | null;
  assetId?: string | null;
  inUse?: boolean;
  deductible?: boolean;
  replacementValue?: number | null;
  resaleValue?: number | null;
  purchasePrice?: number | null;
}

export interface ItemListQuery {
  search?: string;
  inUse?: 'true' | 'false';
  deductible?: 'true' | 'false';
  locationId?: string;
}

export function makeClient(app: Express) {
  const r = supertest(app);
  return {
    search: {
      run: (body: { query: { text: string; filters?: unknown[] }; context?: unknown }) =>
        send<{ hits: SearchHit[] }>(r.post('/search').send(body)),
    },
    items: {
      list: (query: ItemListQuery = {}) =>
        send<{
          data: InventoryItem[];
          pagination: Pagination;
          totals: { totalReplacementValue: number; totalResaleValue: number };
        }>(r.get('/items').query(query)),
      get: (id: string) => send<{ data: InventoryItem }>(r.get(`/items/${id}`)),
      create: (body: ItemCreateBody) => send<ItemEnvelope>(r.post('/items').send(body)),
      update: (id: string, data: Partial<ItemCreateBody>) =>
        send<ItemEnvelope>(r.patch(`/items/${id}`).send(data)),
      delete: (id: string) => send<{ message: string }>(r.delete(`/items/${id}`)),
      searchByAssetId: (assetId: string) =>
        send<{ data: InventoryItem | null }>(r.get('/items/search/by-asset-id').query({ assetId })),
      countByAssetPrefix: (prefix: string) =>
        send<{ data: number }>(r.get('/items/stats/count-by-asset-prefix').query({ prefix })),
      distinctTypes: () => send<{ data: string[] }>(r.get('/items/stats/distinct-types')),
    },
    locations: {
      list: () => send<{ data: Location[]; total: number }>(r.get('/locations')),
      tree: () => send<{ data: LocationTreeNodeShape[] }>(r.get('/locations/tree')),
      get: (id: string) => send<{ data: Location }>(r.get(`/locations/${id}`)),
      getPath: (id: string) => send<{ data: Location[] }>(r.get(`/locations/${id}/path`)),
      children: (id: string) => send<{ data: Location[] }>(r.get(`/locations/${id}/children`)),
      create: (body: { name: string; parentId?: string | null }) =>
        send<LocationEnvelope>(r.post('/locations').send(body)),
      update: (id: string, data: { name?: string; parentId?: string | null }) =>
        send<LocationEnvelope>(r.patch(`/locations/${id}`).send(data)),
      delete: (id: string, force?: boolean) =>
        send<DeleteAck>(
          force === true
            ? r.delete(`/locations/${id}`).query({ force: true })
            : r.delete(`/locations/${id}`)
        ),
    },
  };
}
