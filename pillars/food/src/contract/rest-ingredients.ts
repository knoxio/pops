/**
 * `ingredients.*` sub-router — the ingredient catalogue: CRUD plus the
 * hierarchy operations (rename slug, change parent) and the delete-blocker
 * projections (variants / aliases counts, recipe references) the FE shows
 * before allowing a destructive delete.
 *
 * Literal sub-path `/ingredients/rename` is declared before the
 * `/ingredients/:idOrSlug` param route so it registers first.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, PathPositiveInt, QueryPositiveInt } from './rest-schemas.js';

const c = initContract();

const UnitEnum = z.enum(['g', 'ml', 'count']);

export const IngredientSchema = z.object({
  id: z.number().int().positive(),
  parentId: z.number().int().positive().nullable(),
  name: z.string(),
  slug: z.string(),
  defaultUnit: UnitEnum,
  densityGPerMl: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

const IngredientVariantSchema = z.object({
  id: z.number().int().positive(),
  ingredientId: z.number().int().positive(),
  name: z.string(),
  slug: z.string(),
  defaultUnit: UnitEnum,
  packageSizeG: z.number().nullable(),
  notes: z.string().nullable(),
  defaultShelfLifeDaysFridge: z.number().int().nullable(),
  defaultShelfLifeDaysFreezer: z.number().int().nullable(),
  createdAt: z.string(),
});

const DeleteBlockerSummarySchema = z.object({
  variants: z.number().int(),
  aliases: z.number().int(),
});

const RecipeRefsSummarySchema = z.object({
  count: z.number().int(),
  recipes: z.array(
    z.object({
      recipeId: z.number().int().positive(),
      recipeSlug: z.string(),
      recipeTitle: z.string(),
    })
  ),
});

const CreateIngredientBody = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  defaultUnit: UnitEnum,
  parentId: z.number().int().positive().nullish(),
  densityGPerMl: z.number().positive().nullish(),
  notes: z.string().nullish(),
});

const UpdateIngredientBody = z.object({
  name: z.string().min(1).optional(),
  defaultUnit: UnitEnum.optional(),
  densityGPerMl: z.number().positive().nullish(),
  notes: z.string().nullish(),
});

export const foodIngredientsContract = c.router({
  list: {
    method: 'GET',
    path: '/ingredients',
    query: z.object({
      search: z.string().optional(),
      parentId: QueryPositiveInt.optional(),
    }),
    responses: { 200: z.object({ items: z.array(IngredientSchema) }) },
    summary: 'List ingredients (optionally filtered by search / parent)',
  },
  rename: {
    method: 'POST',
    path: '/ingredients/rename',
    body: z.object({ oldSlug: z.string().min(1), newSlug: z.string().min(1) }),
    responses: { 200: z.object({ data: IngredientSchema }), ...ERR_RESPONSES },
    summary: 'Rename an ingredient slug (updates the slug registry)',
  },
  create: {
    method: 'POST',
    path: '/ingredients',
    body: CreateIngredientBody,
    responses: { 201: z.object({ data: IngredientSchema }), ...ERR_RESPONSES },
    summary: 'Create an ingredient',
  },
  get: {
    method: 'GET',
    path: '/ingredients/:idOrSlug',
    pathParams: z.object({ idOrSlug: z.string().min(1) }),
    responses: {
      200: z.object({ ingredient: IngredientSchema, variants: z.array(IngredientVariantSchema) }),
      ...ERR_RESPONSES,
    },
    summary: 'Get an ingredient (by numeric id or slug) with its variants',
  },
  update: {
    method: 'PATCH',
    path: '/ingredients/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: UpdateIngredientBody,
    responses: { 200: z.object({ data: IngredientSchema }), ...ERR_RESPONSES },
    summary: 'Update an ingredient',
  },
  changeParent: {
    method: 'POST',
    path: '/ingredients/:id/parent',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({ newParentId: z.number().int().positive().nullable() }),
    responses: { 200: z.object({ data: IngredientSchema }), ...ERR_RESPONSES },
    summary: 'Re-parent an ingredient (cycle / depth guarded)',
  },
  blockers: {
    method: 'GET',
    path: '/ingredients/:id/blockers',
    pathParams: z.object({ id: PathPositiveInt }),
    responses: { 200: z.object({ data: DeleteBlockerSummarySchema }) },
    summary: 'FK-backed delete blockers (variants + aliases counts)',
  },
  recipeRefs: {
    method: 'GET',
    path: '/ingredients/:id/recipe-refs',
    pathParams: z.object({ id: PathPositiveInt }),
    responses: { 200: RecipeRefsSummarySchema },
    summary: 'Recipes referencing this ingredient via compiled lines',
  },
  delete: {
    method: 'DELETE',
    path: '/ingredients/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: {
      200: z.union([
        z.object({ ok: z.literal(true) }),
        z.object({ ok: z.literal(false), blockers: DeleteBlockerSummarySchema }),
      ]),
      ...ERR_RESPONSES,
    },
    summary: 'Delete an ingredient; returns blockers when variants/aliases remain',
  },
});
