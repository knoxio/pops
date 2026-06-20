/**
 * `ingredientTags.*` sub-router — the free-form tag vocabulary attached to
 * ingredients (e.g. `store-section:produce`, `diet:vegan`). `set` is a full
 * replacement; tag normalisation + validation happen in the db service and
 * surface as a structured `{ ok: false, reason }` rather than an HTTP error.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { PathPositiveInt, QueryPositiveInt } from './rest-schemas.js';

const c = initContract();

const TagOpResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['BadTagFormat', 'TagTooLong', 'IngredientNotFound']),
  }),
]);

const TagDistinctRowSchema = z.object({
  tag: z.string(),
  ingredientCount: z.number().int(),
  firstSeenAt: z.string(),
});

const IngredientSummarySchema = z.object({
  id: z.number().int().positive(),
  slug: z.string(),
  name: z.string(),
});

export const foodIngredientTagsContract = c.router({
  list: {
    method: 'GET',
    path: '/ingredient-tags',
    query: z.object({ ingredientId: QueryPositiveInt }),
    responses: { 200: z.object({ tags: z.array(z.string()) }) },
    summary: "List an ingredient's tags",
  },
  distinct: {
    method: 'GET',
    path: '/ingredient-tags/distinct',
    query: z.object({
      namespacePrefix: z.string().min(1).optional(),
      limit: z.coerce.number().int().positive().max(500).optional(),
    }),
    responses: { 200: z.object({ tags: z.array(TagDistinctRowSchema) }) },
    summary: 'Distinct tags with usage counts (optionally namespace-scoped)',
  },
  byTag: {
    method: 'GET',
    path: '/ingredient-tags/by-tag',
    query: z.object({ tag: z.string().min(1) }),
    responses: { 200: z.object({ ingredients: z.array(IngredientSummarySchema) }) },
    summary: 'Ingredients carrying a given tag',
  },
  set: {
    method: 'PUT',
    path: '/ingredient-tags/:ingredientId',
    pathParams: z.object({ ingredientId: PathPositiveInt }),
    body: z.object({ tags: z.array(z.string()) }),
    responses: { 200: TagOpResultSchema },
    summary: "Replace an ingredient's tag set",
  },
});
