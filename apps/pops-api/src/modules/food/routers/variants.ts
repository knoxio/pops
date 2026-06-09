import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { InvalidSlugError, variantsService } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

/**
 * Food → variants tRPC procedures (PRD-122).
 *
 * Variants are scoped under their parent ingredient (PRD-106 invariant);
 * `(ingredient_id, slug)` UNIQUE is enforced at the DB level. There's no
 * global "list all variants" endpoint — use `food.ingredients.get` for the
 * per-parent set.
 *
 * Shelf-life fields (`defaultShelfLifeDaysFridge` / `Freezer`) land on the
 * `ingredient_variants` row via PRD-108's ALTER. The data page surfaces
 * them inline alongside the other variant columns.
 */

const UNIT_ENUM = z.enum(['g', 'ml', 'count']);

function isSqliteUniqueError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

function isSqliteFkError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
  );
}

function rethrowVariantError(err: unknown): never {
  if (err instanceof InvalidSlugError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  if (isSqliteUniqueError(err)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'A variant with this slug already exists under the parent ingredient',
      cause: err,
    });
  }
  if (isSqliteFkError(err)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Variant is referenced by another row (batch, recipe line, alias, or substitution)',
      cause: err,
    });
  }
  throw err as Error;
}

const UPDATE_INPUT = z
  .object({
    id: z.number(),
    name: z.string().min(1).optional(),
    slug: z.string().optional(),
    defaultUnit: UNIT_ENUM.optional(),
    packageSizeG: z.number().nullable().optional(),
    defaultShelfLifeDaysFridge: z.number().int().nonnegative().nullable().optional(),
    defaultShelfLifeDaysFreezer: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'id' && v[k as keyof typeof v] !== undefined), {
    message: 'patch must include at least one field besides id',
  });

export const variantsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        ingredientId: z.number(),
        slug: z.string(),
        name: z.string().min(1),
        defaultUnit: UNIT_ENUM,
        packageSizeG: z.number().nullable().optional(),
        defaultShelfLifeDaysFridge: z.number().int().nonnegative().nullable().optional(),
        defaultShelfLifeDaysFreezer: z.number().int().nonnegative().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      try {
        return variantsService.createVariant(getDrizzle(), input);
      } catch (err) {
        rethrowVariantError(err);
      }
    }),

  update: protectedProcedure.input(UPDATE_INPUT).mutation(({ input }) => {
    const { id, ...patch } = input;
    try {
      return variantsService.updateVariant(getDrizzle(), id, patch);
    } catch (err) {
      rethrowVariantError(err);
    }
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    const db = getDrizzle();
    const existing = variantsService.getVariant(db, input.id);
    if (existing === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found' });
    }
    try {
      variantsService.deleteVariant(db, input.id);
    } catch (err) {
      rethrowVariantError(err);
    }
    return { ok: true as const };
  }),
});
