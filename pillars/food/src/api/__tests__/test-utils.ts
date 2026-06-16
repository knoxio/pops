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

type AliasSource = 'user' | 'llm' | 'ingest';
type AliasTarget = { kind: 'ingredient' | 'variant'; id: number };

interface IngredientAlias {
  id: number;
  ingredientId: number | null;
  variantId: number | null;
  alias: string;
  source: AliasSource;
  createdAt: string;
}

type TagOpResult =
  | { ok: true }
  | { ok: false; reason: 'BadTagFormat' | 'TagTooLong' | 'IngredientNotFound' };

interface Ingredient {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  defaultUnit: 'g' | 'ml' | 'count';
  densityGPerMl: number | null;
  notes: string | null;
  createdAt: string;
}

interface DeleteBlockerSummary {
  variants: number;
  aliases: number;
}

type IngredientDeleteResult = { ok: true } | { ok: false; blockers: DeleteBlockerSummary };

interface CreateIngredientBody {
  slug: string;
  name: string;
  defaultUnit: 'g' | 'ml' | 'count';
  parentId?: number | null;
  densityGPerMl?: number | null;
  notes?: string | null;
}

type SubEndpoint = { ingredientId?: number; variantId?: number };

interface SubstitutionView {
  id: number;
  fromIngredientId: number | null;
  toIngredientId: number | null;
  ratio: number;
  contextTags: readonly string[];
  scope: 'global' | 'recipe';
  recipeId: number | null;
  notes: string | null;
  createdAt: string;
}

interface GraphView {
  nodes: { id: string; kind: 'ingredient' | 'variant' }[];
  edges: { id: number; fromNodeId: string; toNodeId: string }[];
}

interface SolveResult {
  totalCandidates: number;
  cookableCount: number;
  recipes: unknown[];
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
    ingredientTags: {
      list: (ingredientId: number) =>
        send<{ tags: string[] }>(r.get('/ingredient-tags').query({ ingredientId })),
      distinct: (query: { namespacePrefix?: string; limit?: number } = {}) =>
        send<{ tags: { tag: string; ingredientCount: number; firstSeenAt: string }[] }>(
          r.get('/ingredient-tags/distinct').query(query)
        ),
      byTag: (tag: string) =>
        send<{ ingredients: { id: number; slug: string; name: string }[] }>(
          r.get('/ingredient-tags/by-tag').query({ tag })
        ),
      set: (ingredientId: number, tags: string[]) =>
        send<TagOpResult>(r.put(`/ingredient-tags/${ingredientId}`).send({ tags })),
    },
    aliases: {
      list: (query: { search?: string; source?: AliasSource } = {}) =>
        send<{ items: IngredientAlias[] }>(r.get('/aliases').query(query)),
      listWithTargets: (query: { search?: string } = {}) =>
        send<{ items: unknown[] }>(r.get('/aliases/with-targets').query(query)),
      create: (body: { alias: string; target: AliasTarget; source?: AliasSource }) =>
        send<{ data: IngredientAlias }>(r.post('/aliases').send(body)),
      updateText: (id: number, alias: string) =>
        send<{ data: IngredientAlias }>(r.patch(`/aliases/${id}`).send({ alias })),
      delete: (id: number) => send<{ ok: true }>(r.delete(`/aliases/${id}`)),
      merge: (aliasIds: number[], target: AliasTarget) =>
        send<{ mergedCount: number }>(r.post('/aliases/merge').send({ aliasIds, target })),
      bulkApprove: (aliasIds: number[]) =>
        send<{ updatedCount: number }>(r.post('/aliases/bulk-approve').send({ aliasIds })),
    },
    ingredients: {
      list: (query: { search?: string; parentId?: number } = {}) =>
        send<{ items: Ingredient[] }>(r.get('/ingredients').query(query)),
      get: (idOrSlug: number | string) =>
        send<{ ingredient: Ingredient; variants: IngredientVariant[] }>(
          r.get(`/ingredients/${idOrSlug}`)
        ),
      create: (body: CreateIngredientBody) =>
        send<{ data: Ingredient }>(r.post('/ingredients').send(body)),
      update: (
        id: number,
        body: { name?: string; defaultUnit?: 'g' | 'ml' | 'count'; notes?: string | null }
      ) => send<{ data: Ingredient }>(r.patch(`/ingredients/${id}`).send(body)),
      rename: (oldSlug: string, newSlug: string) =>
        send<{ data: Ingredient }>(r.post('/ingredients/rename').send({ oldSlug, newSlug })),
      changeParent: (id: number, newParentId: number | null) =>
        send<{ data: Ingredient }>(r.post(`/ingredients/${id}/parent`).send({ newParentId })),
      blockers: (id: number) =>
        send<{ data: DeleteBlockerSummary }>(r.get(`/ingredients/${id}/blockers`)),
      recipeRefs: (id: number) =>
        send<{ count: number; recipes: unknown[] }>(r.get(`/ingredients/${id}/recipe-refs`)),
      delete: (id: number) => send<IngredientDeleteResult>(r.delete(`/ingredients/${id}`)),
    },
    substitutions: {
      list: (query: { scope?: 'global' | 'recipe'; recipeId?: number } = {}) =>
        send<{ items: SubstitutionView[] }>(r.get('/substitutions').query(query)),
      graphView: (query: { scope?: 'global' | 'recipe'; recipeId?: number } = {}) =>
        send<GraphView>(r.get('/substitutions/graph-view').query(query)),
      resolveForLine: (recipeVersionId: number, lineIndex: number) =>
        send<unknown>(r.get('/substitutions/resolve-line').query({ recipeVersionId, lineIndex })),
      create: (body: {
        from: SubEndpoint;
        to: SubEndpoint;
        ratio?: number;
        contextTags?: string[];
        scope?: 'global' | 'recipe';
        recipeId?: number | null;
        notes?: string | null;
      }) => send<{ data: SubstitutionView }>(r.post('/substitutions').send(body)),
      update: (id: number, body: { ratio?: number; notes?: string | null }) =>
        send<{ data: SubstitutionView }>(r.patch(`/substitutions/${id}`).send(body)),
      delete: (id: number) => send<{ ok: true }>(r.delete(`/substitutions/${id}`)),
    },
    solver: {
      canICook: (
        body: {
          excludeSubs?: boolean;
          recipeTypes?: string[];
          tags?: string[];
          maxMinutes?: number;
        } = {}
      ) => send<SolveResult>(r.post('/solver/can-i-cook').send(body)),
    },
  };
}
