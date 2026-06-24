/**
 * `sendToList.*` sub-router — aggregates a recipe version's lines into
 * shopping-list items and writes them to the lists pillar over REST (no
 * cross-pillar DB write). `prepare` returns the preview the modal renders;
 * `send` performs the upserts and returns add/merge counts.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { PathPositiveInt } from './rest-schemas.js';

const c = initContract();

const PreviewItemSchema = z.object({
  label: z.string(),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  ingredientId: z.number().int(),
  variantId: z.number().int().nullable(),
  prepStateLabel: z.string().nullable(),
  sourceLineIds: z.array(z.number().int()),
});

const SendPreviewSchema = z.object({
  recipeTitle: z.string(),
  scaleFactor: z.number(),
  canonicalItems: z.array(PreviewItemSchema),
  unconvertedItems: z.array(PreviewItemSchema),
  alreadySentToListIds: z.array(z.number().int()),
});

const SendToListResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    listId: z.number().int(),
    addedCount: z.number().int(),
    mergedCount: z.number().int(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum([
      'RecipeNotFound',
      'NoIngredients',
      'TargetListNotFound',
      'TargetListArchived',
      'TargetListNotShopping',
      'NameRequiredForNew',
      'CompileNotReady',
    ]),
  }),
]);

const SendTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), listId: z.number().int().positive() }),
  z.object({ kind: z.literal('new'), name: z.string().min(1) }),
]);

export const foodSendToListContract = c.router({
  prepare: {
    method: 'GET',
    path: '/recipes/versions/:versionId/send-to-list/preview',
    pathParams: z.object({ versionId: PathPositiveInt }),
    query: z.object({ scaleFactor: z.coerce.number().optional() }),
    responses: {
      200: SendPreviewSchema,
      400: z.object({ message: z.string(), code: z.string().optional() }),
      404: z.object({ message: z.string(), code: z.string().optional() }),
    },
    summary: 'Preview the items a recipe version would add to a shopping list',
  },
  send: {
    method: 'POST',
    path: '/recipes/versions/:versionId/send-to-list',
    pathParams: z.object({ versionId: PathPositiveInt }),
    body: z.object({ scaleFactor: z.number().optional(), target: SendTargetSchema }),
    responses: { 200: SendToListResultSchema },
    summary: 'Send a recipe version’s ingredients to a shopping list',
  },
});
