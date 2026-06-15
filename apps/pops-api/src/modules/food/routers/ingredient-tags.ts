/**
 * `food.ingredients.tags.*` tRPC router — PRD-151.
 *
 * Thin pass-through over `ingredientTagsService`. Procedures:
 *   - `list` — current tag set on an ingredient (chip editor read)
 *   - `set` — full-replacement mutation (chip editor save)
 *   - `distinct` — autocomplete + vocabulary view (powered by the
 *     namespace expression index when `namespacePrefix` is supplied)
 *   - `findByTag` — ingredients-by-tag drill-down used by the vocab tab
 *
 * Service-level errors are returned as `{ ok: false, reason }` rather than
 * thrown — keeps the client's optimistic-update flow simple (no try/catch
 * around the mutate call) and the validator's namespaced regex copy lives
 * in one place (the service).
 */
import { z } from 'zod';

import { ingredientTagsService } from '@pops/app-food-db';

import { getFoodDrizzle } from '../../../db/food-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';

const TagOpOutput = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['BadTagFormat', 'TagTooLong', 'IngredientNotFound']),
  }),
]);

export const ingredientTagsRouter = router({
  list: protectedProcedure
    .input(z.object({ ingredientId: z.number().int().positive() }))
    .query(({ input }) =>
      ingredientTagsService.listTagsForIngredient(getFoodDrizzle(), input.ingredientId)
    ),

  set: protectedProcedure
    .input(
      z.object({
        ingredientId: z.number().int().positive(),
        tags: z.array(z.string()),
      })
    )
    .output(TagOpOutput)
    .mutation(({ input }) =>
      ingredientTagsService.setTagsForIngredient(getFoodDrizzle(), input.ingredientId, input.tags)
    ),

  distinct: protectedProcedure
    .input(
      z.object({
        namespacePrefix: z.string().min(1).optional(),
        limit: z.number().int().positive().max(500).optional(),
      })
    )
    .query(({ input }) =>
      ingredientTagsService.listDistinctTags(getFoodDrizzle(), {
        namespacePrefix: input.namespacePrefix ?? null,
        limit: input.limit,
      })
    ),

  findByTag: protectedProcedure
    .input(z.object({ tag: z.string().min(1) }))
    .query(({ input }) => ingredientTagsService.listIngredientsByTag(getFoodDrizzle(), input.tag)),
});
