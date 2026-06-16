/**
 * Supertest-backed REST client for the food pillar integration tests.
 *
 * Preserves the caller-shaped API the old tRPC tests used
 * (`client.conversions.createUnit({...})`) so per-test bodies stay
 * readable — only the transport changed. Non-2xx responses throw
 * `HttpError` with the parsed `{ status, body }` so tests assert on
 * `.rejects.toMatchObject({ status })` instead of the old TRPCError code.
 */
import supertest from 'supertest';

import type { Express } from 'express';

import type { IngredientWeight, UnitConversion } from '../modules/conversions/types.js';

interface PrepState {
  id: number;
  name: string;
  slug: string;
}

interface IngredientVariant {
  id: number;
  ingredientId: number;
  name: string;
  slug: string;
  defaultUnit: 'g' | 'ml' | 'count';
  packageSizeG: number | null;
  notes: string | null;
  defaultShelfLifeDaysFridge: number | null;
  defaultShelfLifeDaysFreezer: number | null;
  createdAt: string;
}

interface SlugMatch {
  slug: string;
  kind: 'ingredient' | 'recipe' | 'prep_state';
  targetId: number;
  name: string;
}

interface CreateVariantBody {
  ingredientId: number;
  slug: string;
  name: string;
  defaultUnit: 'g' | 'ml' | 'count';
  packageSizeG?: number | null;
  notes?: string | null;
}

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

type DeleteResult = { ok: true } | { ok: false; reason: 'seeded' };

type ResolveResult =
  | { kind: 'resolved'; canonicalUnit: 'g' | 'ml' | 'count'; qty: number }
  | { kind: 'unresolved' };

interface CreateUnitBody {
  fromUnit: string;
  toUnit: 'g' | 'ml' | 'count';
  ratio: number;
  notes?: string;
}

interface CreateWeightBody {
  ingredientId: number;
  variantId?: number | null;
  unit: string;
  grams: number;
  notes?: string;
}

export function makeClient(app: Express) {
  const r = supertest(app);
  return {
    conversions: {
      listUnits: (query: { search?: string; seededOnly?: boolean } = {}) =>
        send<{ items: UnitConversion[] }>(r.get('/conversions/units').query(query)),
      createUnit: (body: CreateUnitBody) =>
        send<{ data: UnitConversion }>(r.post('/conversions/units').send(body)),
      updateUnit: (id: number, body: { ratio?: number; notes?: string | null }) =>
        send<{ data: UnitConversion }>(r.patch(`/conversions/units/${id}`).send(body)),
      deleteUnit: (id: number) => send<DeleteResult>(r.delete(`/conversions/units/${id}`)),
      listWeights: (query: { ingredientId?: number; search?: string; seededOnly?: boolean } = {}) =>
        send<{ items: IngredientWeight[] }>(r.get('/conversions/weights').query(query)),
      createWeight: (body: CreateWeightBody) =>
        send<{ data: IngredientWeight }>(r.post('/conversions/weights').send(body)),
      updateWeight: (id: number, body: { grams?: number; notes?: string | null }) =>
        send<{ data: IngredientWeight }>(r.patch(`/conversions/weights/${id}`).send(body)),
      deleteWeight: (id: number) => send<DeleteResult>(r.delete(`/conversions/weights/${id}`)),
      resolve: (query: { ingredientId: number; variantId?: number; unit: string; qty: number }) =>
        send<ResolveResult>(r.get('/conversions/resolve').query(query)),
    },
    prepStates: {
      list: () => send<{ items: PrepState[] }>(r.get('/prep-states')),
      create: (body: { slug: string; name: string }) =>
        send<{ data: PrepState }>(r.post('/prep-states').send(body)),
    },
    slugs: {
      search: (query: {
        query: string;
        kinds?: ('ingredient' | 'recipe' | 'prep_state')[];
        limit?: number;
      }) => send<{ items: SlugMatch[] }>(r.get('/slugs/search').query(query)),
    },
    variants: {
      create: (body: CreateVariantBody) =>
        send<{ data: IngredientVariant }>(r.post('/variants').send(body)),
      update: (id: number, body: { name?: string; slug?: string; packageSizeG?: number | null }) =>
        send<{ data: IngredientVariant }>(r.patch(`/variants/${id}`).send(body)),
      delete: (id: number) => send<{ ok: true }>(r.delete(`/variants/${id}`)),
    },
  };
}
