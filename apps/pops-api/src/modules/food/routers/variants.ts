import { TRPCError } from '@trpc/server';
import { z } from 'zod';

/**
 * Food → variants tRPC procedures (PRD-122).
 *
 * Variants are scoped under their parent ingredient (PRD-106 invariant);
 * `(ingredient_id, slug)` UNIQUE is enforced at the DB level. There's no
 * global "list all variants" endpoint — use `food.ingredients.get` for the
 * per-parent set.
 */
import { InvalidSlugError, variantsService } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

const UNIT_ENUM = z.enum(['g', 'ml', 'count']);

function rethrowInvalidSlug(err: unknown): never {
  if (err instanceof InvalidSlugError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  throw err as Error;
}

export const variantsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        ingredientId: z.number(),
        slug: z.string(),
        name: z.string().min(1),
        defaultUnit: UNIT_ENUM,
        packageSizeG: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      try {
        return variantsService.createVariant(getDrizzle(), input);
      } catch (err) {
        rethrowInvalidSlug(err);
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        slug: z.string().optional(),
        defaultUnit: UNIT_ENUM.optional(),
        packageSizeG: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      try {
        return variantsService.updateVariant(getDrizzle(), id, patch);
      } catch (err) {
        rethrowInvalidSlug(err);
      }
    }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    variantsService.deleteVariant(getDrizzle(), input.id);
    return { ok: true as const };
  }),
});
