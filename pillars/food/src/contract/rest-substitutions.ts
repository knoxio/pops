/**
 * `substitutions.*` sub-router — the ingredient/variant substitution graph:
 * CRUD, the hydrated list, the node/edge graph-view projection, and the
 * per-line resolver (`resolveForLine`) the cook picker drives.
 *
 * Endpoints are XOR-shaped (exactly one of ingredientId / variantId per
 * side); the db service enforces it and `CannotSubstituteSelf` maps to 400.
 * Literal `/substitutions/graph-view` and `/substitutions/resolve-line` are
 * declared before the `/substitutions/:id` param routes.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, PathPositiveInt, QueryPositiveInt } from './rest-schemas.js';

const c = initContract();

const ScopeEnum = z.enum(['global', 'recipe']);
const UnitEnum = z.enum(['g', 'ml', 'count']);
const ContextTags = z.array(z.string()).readonly();

export const SubstitutionViewSchema = z.object({
  id: z.number().int().positive(),
  fromIngredientId: z.number().int().positive().nullable(),
  fromVariantId: z.number().int().positive().nullable(),
  toIngredientId: z.number().int().positive().nullable(),
  toVariantId: z.number().int().positive().nullable(),
  ratio: z.number(),
  contextTags: ContextTags,
  scope: ScopeEnum,
  recipeId: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

const HydratedEndpointSchema = z.object({
  kind: z.enum(['ingredient', 'variant']),
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  parentSlug: z.string().nullable(),
});

const HydratedSubstitutionViewSchema = SubstitutionViewSchema.extend({
  from: HydratedEndpointSchema,
  to: HydratedEndpointSchema,
  recipeSlug: z.string().nullable(),
});

const GraphViewNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['ingredient', 'variant']),
  ingredientId: z.number().int(),
  variantId: z.number().int().nullable(),
  ingredientSlug: z.string(),
  ingredientName: z.string(),
  variantSlug: z.string().nullable(),
  variantName: z.string().nullable(),
});

const GraphViewEdgeSchema = z.object({
  id: z.number().int(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  ratio: z.number(),
  contextTags: ContextTags,
  scope: ScopeEnum,
  recipeId: z.number().int().nullable(),
  recipeSlug: z.string().nullable(),
  notes: z.string().nullable(),
});

const GraphViewSchema = z.object({
  nodes: z.array(GraphViewNodeSchema),
  edges: z.array(GraphViewEdgeSchema),
});

const SubCandidateBatchSchema = z.object({
  batchId: z.number().int(),
  qtyRemaining: z.number(),
  unit: UnitEnum,
  location: z.enum(['pantry', 'fridge', 'freezer', 'other']),
  expiresAt: z.string().nullable(),
  prepStateId: z.number().int().nullable(),
  prepStateLabel: z.string().nullable(),
});

const SubCandidateSchema = z.object({
  substitutionId: z.number().int(),
  ratio: z.number(),
  contextTags: ContextTags,
  scope: ScopeEnum,
  recipeId: z.number().int().nullable(),
  substituteVariantId: z.number().int(),
  substituteVariantName: z.string(),
  substituteIngredientId: z.number().int(),
  substituteIngredientName: z.string(),
  notes: z.string().nullable(),
  batches: z.array(SubCandidateBatchSchema).readonly(),
});

const SubResolutionSchema = z.object({
  lineIndex: z.number().int(),
  lineVariantId: z.number().int(),
  lineVariantName: z.string(),
  linePrepStateId: z.number().int().nullable(),
  linePrepStateLabel: z.string().nullable(),
  lineQty: z.number(),
  lineUnit: UnitEnum,
  recipeContextTags: ContextTags,
  candidates: z.array(SubCandidateSchema).readonly(),
});

const EndpointBody = z
  .object({
    ingredientId: z.number().int().positive().optional(),
    variantId: z.number().int().positive().optional(),
  })
  .refine((v) => (v.ingredientId === undefined) !== (v.variantId === undefined), {
    message: 'endpoint must set exactly one of ingredientId or variantId',
  });

const ListFilterQuery = z.object({
  fromIngredientId: QueryPositiveInt.optional(),
  fromVariantId: QueryPositiveInt.optional(),
  toIngredientId: QueryPositiveInt.optional(),
  toVariantId: QueryPositiveInt.optional(),
  scope: ScopeEnum.optional(),
  recipeId: QueryPositiveInt.optional(),
  contextTag: z.string().optional(),
});

export const foodSubstitutionsContract = c.router({
  list: {
    method: 'GET',
    path: '/substitutions',
    query: ListFilterQuery,
    responses: { 200: z.object({ items: z.array(SubstitutionViewSchema) }) },
    summary: 'List substitutions (raw FK ids)',
  },
  listHydrated: {
    method: 'GET',
    path: '/substitutions/hydrated',
    query: ListFilterQuery,
    responses: { 200: z.object({ items: z.array(HydratedSubstitutionViewSchema) }) },
    summary: 'List substitutions widened with slug + display name per endpoint',
  },
  graphView: {
    method: 'GET',
    path: '/substitutions/graph-view',
    query: z.object({
      scope: ScopeEnum.optional(),
      recipeId: QueryPositiveInt.optional(),
      contextTag: z.string().optional(),
      search: z.string().optional(),
    }),
    responses: { 200: GraphViewSchema, ...ERR_RESPONSES },
    summary: 'Node/edge projection of the substitution graph',
  },
  resolveForLine: {
    method: 'GET',
    path: '/substitutions/resolve-line',
    query: z.object({
      recipeVersionId: QueryPositiveInt,
      lineIndex: QueryPositiveInt,
    }),
    responses: { 200: SubResolutionSchema, ...ERR_RESPONSES },
    summary: 'Per-line substitution candidates with batch coverage',
  },
  create: {
    method: 'POST',
    path: '/substitutions',
    body: z
      .object({
        from: EndpointBody,
        to: EndpointBody,
        ratio: z.number().positive().optional(),
        contextTags: z.array(z.string()).optional(),
        scope: ScopeEnum.optional(),
        recipeId: z.number().int().positive().nullish(),
        notes: z.string().nullish(),
      })
      .refine(
        (v) => {
          const scope = v.scope ?? 'global';
          return scope === 'recipe'
            ? v.recipeId !== undefined && v.recipeId !== null
            : v.recipeId === undefined || v.recipeId === null;
        },
        { message: 'scope="recipe" requires recipeId; scope="global" must omit recipeId' }
      ),
    responses: { 201: z.object({ data: SubstitutionViewSchema }), ...ERR_RESPONSES },
    summary: 'Create a substitution edge',
  },
  update: {
    method: 'PATCH',
    path: '/substitutions/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({
      ratio: z.number().positive().optional(),
      contextTags: z.array(z.string()).optional(),
      notes: z.string().nullish(),
    }),
    responses: { 200: z.object({ data: SubstitutionViewSchema }), ...ERR_RESPONSES },
    summary: 'Update a substitution edge',
  },
  delete: {
    method: 'DELETE',
    path: '/substitutions/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: z.object({ ok: z.literal(true) }), ...ERR_RESPONSES },
    summary: 'Delete a substitution edge',
  },
});
