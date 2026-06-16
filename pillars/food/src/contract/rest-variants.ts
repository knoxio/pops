/**
 * `variants.*` sub-router — CRUD over ingredient variants (brand/pack
 * specialisations of an ingredient). Variant slugs are scoped per parent
 * ingredient (DB UNIQUE on `(ingredient_id, slug)`), not in the global
 * slug registry.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, PathPositiveInt } from './rest-schemas.js';

const c = initContract();

const UnitEnum = z.enum(['g', 'ml', 'count']);

export const IngredientVariantSchema = z.object({
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

const CreateVariantBody = z.object({
  ingredientId: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1),
  defaultUnit: UnitEnum,
  packageSizeG: z.number().positive().nullish(),
  notes: z.string().nullish(),
  defaultShelfLifeDaysFridge: z.number().int().nonnegative().nullish(),
  defaultShelfLifeDaysFreezer: z.number().int().nonnegative().nullish(),
});

const UpdateVariantBody = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  defaultUnit: UnitEnum.optional(),
  packageSizeG: z.number().positive().nullish(),
  notes: z.string().nullish(),
});

export const foodVariantsContract = c.router({
  create: {
    method: 'POST',
    path: '/variants',
    body: CreateVariantBody,
    responses: { 201: z.object({ data: IngredientVariantSchema }), ...ERR_RESPONSES },
    summary: 'Create an ingredient variant',
  },
  update: {
    method: 'PATCH',
    path: '/variants/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: UpdateVariantBody,
    responses: { 200: z.object({ data: IngredientVariantSchema }), ...ERR_RESPONSES },
    summary: 'Update an ingredient variant',
  },
  delete: {
    method: 'DELETE',
    path: '/variants/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: z.object({ ok: z.literal(true) }), ...ERR_RESPONSES },
    summary: 'Delete an ingredient variant',
  },
});
