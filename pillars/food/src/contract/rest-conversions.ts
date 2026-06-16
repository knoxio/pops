/**
 * `conversions.*` sub-router — unit-conversion and ingredient-weight CRUD
 * plus the canonical-quantity `resolve` lookup.
 *
 * Two seeded lookup tables back this surface: `unit_conversions`
 * (fromUnit → canonical unit × ratio) and `ingredient_weights`
 * (ingredient/variant/unit → grams). Seeded rows are delete-protected; the
 * delete routes answer `{ ok: false, reason: 'seeded' }` rather than 409 so
 * the UI can render a tooltip instead of a toast.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, PathPositiveInt, QueryBool, QueryPositiveInt } from './rest-schemas.js';

const c = initContract();

export const CanonicalUnitSchema = z.enum(['g', 'ml', 'count']);

export const UnitConversionSchema = z.object({
  id: z.number().int().positive(),
  fromUnit: z.string(),
  toUnit: CanonicalUnitSchema,
  ratio: z.number(),
  notes: z.string().nullable(),
  seeded: z.boolean(),
  createdAt: z.string(),
});

export const IngredientWeightSchema = z.object({
  id: z.number().int().positive(),
  ingredientId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable(),
  unit: z.string(),
  grams: z.number(),
  notes: z.string().nullable(),
  seeded: z.boolean(),
  createdAt: z.string(),
});

/**
 * `resolve` result — discriminated union the client narrows on. `resolved`
 * carries the canonical unit + multiplied qty; `unresolved` means no row in
 * either lookup table covered the input (caller falls back to the
 * ingredient's `default_unit` with null canonical qty).
 */
export const ResolveResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('resolved'), canonicalUnit: CanonicalUnitSchema, qty: z.number() }),
  z.object({ kind: z.literal('unresolved') }),
]);

/**
 * Delete result — `ok:false / reason:'seeded'` when the target is a
 * delete-protected seeded row; idempotent `ok:true` on unknown id (matches
 * the upstream no-op-on-missing contract).
 */
export const DeleteResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.literal('seeded') }),
]);

const CreateUnitBody = z.object({
  fromUnit: z.string().min(1),
  toUnit: CanonicalUnitSchema,
  ratio: z.number().positive(),
  notes: z.string().optional(),
});

const UpdateUnitBody = z.object({
  ratio: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
});

const CreateWeightBody = z.object({
  ingredientId: z.number().int().positive(),
  variantId: z.number().int().positive().nullish(),
  unit: z.string().min(1),
  grams: z.number().positive(),
  notes: z.string().optional(),
});

const UpdateWeightBody = z.object({
  grams: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
});

export const foodConversionsContract = c.router({
  listUnits: {
    method: 'GET',
    path: '/conversions/units',
    query: z.object({ search: z.string().optional(), seededOnly: QueryBool.optional() }),
    responses: { 200: z.object({ items: z.array(UnitConversionSchema) }) },
    summary: 'List unit conversions',
  },
  createUnit: {
    method: 'POST',
    path: '/conversions/units',
    body: CreateUnitBody,
    responses: { 201: z.object({ data: UnitConversionSchema }), ...ERR_RESPONSES },
    summary: 'Create a unit conversion',
  },
  updateUnit: {
    method: 'PATCH',
    path: '/conversions/units/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: UpdateUnitBody,
    responses: { 200: z.object({ data: UnitConversionSchema }), ...ERR_RESPONSES },
    summary: 'Update a unit conversion',
  },
  deleteUnit: {
    method: 'DELETE',
    path: '/conversions/units/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: DeleteResultSchema, ...ERR_RESPONSES },
    summary: 'Delete a unit conversion (seeded rows are protected)',
  },
  listWeights: {
    method: 'GET',
    path: '/conversions/weights',
    query: z.object({
      ingredientId: QueryPositiveInt.optional(),
      search: z.string().optional(),
      seededOnly: QueryBool.optional(),
    }),
    responses: { 200: z.object({ items: z.array(IngredientWeightSchema) }) },
    summary: 'List ingredient weights',
  },
  createWeight: {
    method: 'POST',
    path: '/conversions/weights',
    body: CreateWeightBody,
    responses: { 201: z.object({ data: IngredientWeightSchema }), ...ERR_RESPONSES },
    summary: 'Create an ingredient weight',
  },
  updateWeight: {
    method: 'PATCH',
    path: '/conversions/weights/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: UpdateWeightBody,
    responses: { 200: z.object({ data: IngredientWeightSchema }), ...ERR_RESPONSES },
    summary: 'Update an ingredient weight',
  },
  deleteWeight: {
    method: 'DELETE',
    path: '/conversions/weights/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: DeleteResultSchema, ...ERR_RESPONSES },
    summary: 'Delete an ingredient weight (seeded rows are protected)',
  },
  resolve: {
    method: 'GET',
    path: '/conversions/resolve',
    query: z.object({
      ingredientId: QueryPositiveInt,
      variantId: QueryPositiveInt.optional(),
      unit: z.string().min(1),
      qty: z.coerce.number(),
    }),
    responses: { 200: ResolveResultSchema },
    summary: 'Resolve a quantity to its canonical unit',
  },
});
