/**
 * `slugs.*` sub-router — read-only search over the shared slug registry
 * (ingredients, recipes, prep states). Powers the slug-autocomplete the FE
 * uses when wiring cross-references.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/**
 * On the wire a repeated `?kinds=` is an array, a single one is a bare
 * string, and an absent one is `undefined` — normalise to an array (or
 * `undefined`) before the enum validates each member.
 */
function toKindArray(v: unknown): unknown {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

export const SlugKindSchema = z.enum(['ingredient', 'recipe', 'prep_state']);

export const SlugMatchSchema = z.object({
  slug: z.string(),
  kind: SlugKindSchema,
  targetId: z.number().int(),
  name: z.string(),
});

export const foodSlugsContract = c.router({
  search: {
    method: 'GET',
    path: '/slugs/search',
    query: z.object({
      query: z.string(),
      kinds: z.preprocess(toKindArray, z.array(SlugKindSchema)).optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
    responses: { 200: z.object({ items: z.array(SlugMatchSchema) }) },
    summary: 'Search the slug registry by substring, optionally scoped by kind',
  },
});
