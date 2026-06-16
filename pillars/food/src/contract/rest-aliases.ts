/**
 * `aliases.*` sub-router — alternate names that resolve to an ingredient or
 * a variant during ingest. CRUD plus the bulk `merge` (re-point several
 * aliases onto one target) and `bulkApprove` (flip `llm`-sourced rows to
 * `user`) operations the inbox triage UI drives.
 *
 * Literal sub-paths (`/aliases/with-targets`, `/aliases/merge`,
 * `/aliases/bulk-approve`) are declared before the `/aliases/:id` param
 * routes so they register first.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, PathPositiveInt, QueryPositiveInt } from './rest-schemas.js';

const c = initContract();

const AliasSourceSchema = z.enum(['user', 'llm', 'ingest']);
const TargetKindSchema = z.enum(['ingredient', 'variant']);
const AliasTargetSchema = z.object({ kind: TargetKindSchema, id: z.number().int().positive() });

export const IngredientAliasSchema = z.object({
  id: z.number().int().positive(),
  ingredientId: z.number().int().positive().nullable(),
  variantId: z.number().int().positive().nullable(),
  alias: z.string(),
  source: AliasSourceSchema,
  createdAt: z.string(),
});

export const AliasWithTargetSchema = z.object({
  alias: z.object({
    id: z.number().int().positive(),
    alias: z.string(),
    source: AliasSourceSchema,
    createdAt: z.string(),
  }),
  target: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('ingredient'),
      id: z.number().int().positive(),
      slug: z.string(),
      name: z.string(),
    }),
    z.object({
      kind: z.literal('variant'),
      id: z.number().int().positive(),
      slug: z.string(),
      name: z.string(),
      parentIngredientSlug: z.string(),
      parentIngredientName: z.string(),
    }),
  ]),
});

const ListQuery = z.object({
  search: z.string().optional(),
  source: AliasSourceSchema.optional(),
  targetKind: TargetKindSchema.optional(),
  targetId: QueryPositiveInt.optional(),
});

const CreateAliasBody = z.object({
  alias: z.string().min(1),
  target: AliasTargetSchema,
  source: AliasSourceSchema.optional(),
});

export const foodAliasesContract = c.router({
  list: {
    method: 'GET',
    path: '/aliases',
    query: ListQuery,
    responses: { 200: z.object({ items: z.array(IngredientAliasSchema) }) },
    summary: 'List aliases (optionally filtered by search / source / target)',
  },
  listWithTargets: {
    method: 'GET',
    path: '/aliases/with-targets',
    query: ListQuery,
    responses: { 200: z.object({ items: z.array(AliasWithTargetSchema) }) },
    summary: 'List aliases joined with their resolved target metadata',
  },
  merge: {
    method: 'POST',
    path: '/aliases/merge',
    body: z.object({
      aliasIds: z.array(z.number().int().positive()).min(1),
      target: AliasTargetSchema,
    }),
    responses: { 200: z.object({ mergedCount: z.number().int() }), ...ERR_RESPONSES },
    summary: 'Re-point several aliases onto a single canonical target',
  },
  bulkApprove: {
    method: 'POST',
    path: '/aliases/bulk-approve',
    body: z.object({ aliasIds: z.array(z.number().int().positive()).min(1) }),
    responses: { 200: z.object({ updatedCount: z.number().int() }) },
    summary: 'Flip llm-sourced aliases to user-approved',
  },
  create: {
    method: 'POST',
    path: '/aliases',
    body: CreateAliasBody,
    responses: { 201: z.object({ data: IngredientAliasSchema }), ...ERR_RESPONSES },
    summary: 'Create an alias',
  },
  updateText: {
    method: 'PATCH',
    path: '/aliases/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({ alias: z.string().min(1) }),
    responses: { 200: z.object({ data: IngredientAliasSchema }), ...ERR_RESPONSES },
    summary: 'Rename an alias',
  },
  delete: {
    method: 'DELETE',
    path: '/aliases/:id',
    pathParams: z.object({ id: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: z.object({ ok: z.literal(true) }), ...ERR_RESPONSES },
    summary: 'Delete an alias',
  },
});
