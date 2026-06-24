/**
 * `recipes.*` sub-router — recipe CRUD + draft lifecycle. The DSL compile
 * result and the `getForRendering` aggregate are deep, renderer-owned
 * shapes; they are fully modelled in `rest-recipe-render-schemas.ts` so the
 * generated api-types describe the wire shape end-to-end. Send-to-list and
 * hero-image live in their own sub-routers (`rest-send-to-list.ts`,
 * `rest-hero-image.ts`).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  CompileResultSchema,
  RecipeVersionWithCompiledDataSchema,
  SourceSpanSchema,
} from './rest-recipe-render-schemas.js';
import { ERR_RESPONSES, NonEmptyString, PathPositiveInt } from './rest-schemas.js';

const c = initContract();

const RecipeType = z.enum([
  'plate',
  'component',
  'technique',
  'sauce',
  'dressing',
  'drink',
  'condiment',
]);
const SortOrder = z.enum(['createdAtDesc', 'titleAsc', 'recentlyCooked']);
const CompileStatus = z.enum(['uncompiled', 'compiled', 'failed']);

const RecipeListItemSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string(),
  title: z.string().nullable(),
  recipeType: RecipeType,
  heroImagePath: z.string().nullable(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  servings: z.number().nullable(),
  tags: z.array(z.string()),
  hasCurrentVersion: z.boolean(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

const RecipeDraftSummarySchema = z.object({
  versionId: z.number().int(),
  versionNo: z.number().int(),
  title: z.string(),
  compileStatus: CompileStatus,
  createdAt: z.string(),
  preview: z.string(),
});

const ProposedSlugRowSchema = z.object({
  slug: z.string(),
  suggestedKind: z.enum(['ingredient', 'recipe', 'prep_state']).nullable(),
  fromLoc: SourceSpanSchema,
  createdAt: z.string(),
});

const PromoteResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), versionId: z.number().int() }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['ConcurrentPromotion', 'CannotPromoteUncompiledVersion', 'VersionNotFound']),
  }),
]);

const Ok = z.object({ ok: z.literal(true) });

export const foodRecipesContract = c.router({
  list: {
    method: 'POST',
    path: '/recipes/search',
    body: z.object({
      search: z.string().max(200).optional(),
      recipeTypes: z.array(RecipeType).optional(),
      tags: z.array(z.string().min(1)).optional(),
      includeArchived: z.boolean().optional(),
      includeDraftOnly: z.boolean().optional(),
      sort: SortOrder.optional(),
      cursor: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
    responses: {
      200: z.object({ items: z.array(RecipeListItemSchema), nextCursor: z.string().nullable() }),
    },
    summary: 'List recipes (filtered, cursor-paginated)',
  },
  create: {
    method: 'POST',
    path: '/recipes',
    body: z.object({ dsl: NonEmptyString }),
    responses: {
      201: z.object({
        slug: z.string(),
        recipeId: z.number().int(),
        versionId: z.number().int(),
        compile: CompileResultSchema,
      }),
      ...ERR_RESPONSES,
    },
    summary: 'Create a recipe from DSL',
  },
  getForRendering: {
    method: 'GET',
    path: '/recipes/:slug',
    pathParams: z.object({ slug: NonEmptyString }),
    query: z.object({ versionNo: z.coerce.number().int().positive().optional() }),
    responses: { 200: RecipeVersionWithCompiledDataSchema, ...ERR_RESPONSES },
    summary: 'Get a recipe version assembled for rendering',
  },
  listDrafts: {
    method: 'GET',
    path: '/recipes/:slug/drafts',
    pathParams: z.object({ slug: NonEmptyString }),
    responses: { 200: z.object({ drafts: z.array(RecipeDraftSummarySchema) }), ...ERR_RESPONSES },
    summary: 'List a recipe’s draft versions',
  },
  createNewDraft: {
    method: 'POST',
    path: '/recipes/:slug/drafts',
    pathParams: z.object({ slug: NonEmptyString }),
    body: z.object({}).optional(),
    responses: {
      201: z.object({ versionId: z.number().int(), versionNo: z.number().int() }),
      ...ERR_RESPONSES,
    },
    summary: 'Fork a new draft from a recipe’s current version',
  },
  archiveRecipe: {
    method: 'POST',
    path: '/recipes/:slug/archive',
    pathParams: z.object({ slug: NonEmptyString }),
    body: z.object({}).optional(),
    responses: { 200: Ok, ...ERR_RESPONSES },
    summary: 'Archive a recipe',
  },
  saveDraft: {
    method: 'PATCH',
    path: '/recipes/versions/:versionId',
    pathParams: z.object({ versionId: PathPositiveInt }),
    body: z.object({ dsl: NonEmptyString }),
    responses: { 200: z.object({ compile: CompileResultSchema }), ...ERR_RESPONSES },
    summary: 'Save + compile a draft version',
  },
  promote: {
    method: 'POST',
    path: '/recipes/versions/:versionId/promote',
    pathParams: z.object({ versionId: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: PromoteResultSchema },
    summary: 'Promote a compiled draft to current',
  },
  archiveVersion: {
    method: 'POST',
    path: '/recipes/versions/:versionId/archive',
    pathParams: z.object({ versionId: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: { 200: Ok },
    summary: 'Archive a recipe version',
  },
  restoreVersion: {
    method: 'POST',
    path: '/recipes/versions/:versionId/restore',
    pathParams: z.object({ versionId: PathPositiveInt }),
    body: z.object({}).optional(),
    responses: {
      201: z.object({ newVersionId: z.number().int(), newVersionNo: z.number().int() }),
      ...ERR_RESPONSES,
    },
    summary: 'Restore an archived/published version as a new draft',
  },
  listProposedSlugs: {
    method: 'GET',
    path: '/recipes/versions/:versionId/proposed-slugs',
    pathParams: z.object({ versionId: PathPositiveInt }),
    responses: { 200: z.object({ items: z.array(ProposedSlugRowSchema) }) },
    summary: 'List proposed slugs surfaced by a draft’s compile',
  },
});
