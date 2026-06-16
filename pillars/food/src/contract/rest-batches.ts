/**
 * `batches.*` sub-router — PRD-145 batch lifecycle + PRD-146 consume
 * picker. Lifecycle mutations (relocate/edit/adjust/delete) return the
 * service's discriminated `{ ok, ... }` result on 200 (the FE narrows on
 * it); `create` answers 201 or 400. `searchForConsume` is FIFO-ordered
 * server-side.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, PathPositiveInt } from './rest-schemas.js';

const c = initContract();

const Unit = z.enum(['g', 'ml', 'count']);
const Location = z.enum(['pantry', 'fridge', 'freezer', 'other']);
const SourceType = z.enum(['purchase', 'recipe_run', 'gift', 'other']);
const ManualSourceType = z.enum(['purchase', 'gift', 'other']);
const AdjustReason = z.enum(['spoiled', 'wasted', 'correction']);
const BatchErrorEnum = z.enum([
  'BatchNotFound',
  'BatchDeleted',
  'NegativeQty',
  'CannotEditFromRun',
  'BadExpiry',
  'BadAdjustment',
]);

const BatchMutationResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: BatchErrorEnum }),
]);

const BatchAdjustResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), newQty: z.number() }),
  z.object({ ok: z.literal(false), reason: BatchErrorEnum }),
]);

export const BatchDetailSchema = z.object({
  id: z.number().int().positive(),
  variantId: z.number().int().positive(),
  variantName: z.string(),
  variantSlug: z.string(),
  ingredientId: z.number().int().positive(),
  ingredientName: z.string(),
  ingredientSlug: z.string(),
  prepStateId: z.number().int().nullable(),
  prepStateLabel: z.string().nullable(),
  qtyRemaining: z.number(),
  unit: Unit,
  sourceType: SourceType,
  sourceId: z.number().int().nullable(),
  sourceRecipeRunId: z.number().int().nullable(),
  sourceRecipeSlug: z.string().nullable(),
  location: Location,
  producedAt: z.string(),
  expiresAt: z.string().nullable(),
  notes: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});

const BatchForConsumeRowSchema = z.object({
  id: z.number().int().positive(),
  variantId: z.number().int().positive(),
  variantName: z.string(),
  variantSlug: z.string(),
  ingredientId: z.number().int().positive(),
  ingredientName: z.string(),
  prepStateId: z.number().int().nullable(),
  prepStateLabel: z.string().nullable(),
  qtyRemaining: z.number(),
  unit: Unit,
  location: Location,
  expiresAt: z.string().nullable(),
  producedAt: z.string(),
});

export const foodBatchesContract = c.router({
  create: {
    method: 'POST',
    path: '/batches',
    body: z.object({
      variantId: z.number().int().positive(),
      prepStateId: z.number().int().positive().nullable(),
      qty: z.number().finite().nonnegative(),
      unit: Unit,
      location: Location,
      sourceType: ManualSourceType,
      producedAt: z.string().optional(),
      expiresAt: z.string().optional(),
      notes: z.string().max(1000).optional(),
    }),
    responses: { 201: z.object({ batchId: z.number().int().positive() }), ...ERR_RESPONSES },
    summary: 'Create a manual batch',
  },
  // POST (not GET) so the literal path can't be shadowed by GET /batches/:id
  // — ts-rest/express does not order a literal segment ahead of a param one.
  searchForConsume: {
    method: 'POST',
    path: '/batches/search-for-consume',
    body: z.object({
      ingredientId: z.number().int().positive().optional(),
      variantId: z.number().int().positive().optional(),
      location: Location.optional(),
      qtyGreaterThan: z.number().finite().nonnegative().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
    responses: { 200: z.object({ items: z.array(BatchForConsumeRowSchema).readonly() }) },
    summary: 'FIFO-ordered batches for the consume/override picker',
  },
  get: {
    method: 'GET',
    path: '/batches/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    responses: { 200: z.object({ data: BatchDetailSchema }), ...ERR_RESPONSES },
    summary: 'Get a batch with resolved variant / ingredient / source',
  },
  relocate: {
    method: 'POST',
    path: '/batches/:id/relocate',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({ location: Location }),
    responses: { 200: BatchMutationResultSchema },
    summary: 'Move a batch to another location',
  },
  edit: {
    method: 'PATCH',
    path: '/batches/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({
      expiresAt: z.string().nullish(),
      notes: z.string().max(1000).nullish(),
      prepStateId: z.number().int().positive().nullish(),
    }),
    responses: { 200: BatchMutationResultSchema },
    summary: 'Edit a batch (expiry / notes / prep state)',
  },
  adjustQty: {
    method: 'POST',
    path: '/batches/:id/adjust',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({ delta: z.number().finite(), reason: AdjustReason }),
    responses: { 200: BatchAdjustResultSchema },
    summary: 'Adjust a batch quantity (spoiled / wasted / correction)',
  },
  delete: {
    method: 'DELETE',
    path: '/batches/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: BatchMutationResultSchema },
    summary: 'Soft-delete a batch',
  },
});
