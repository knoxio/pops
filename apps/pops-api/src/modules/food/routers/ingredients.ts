import { TRPCError } from '@trpc/server';
import { z } from 'zod';

/**
 * Food → ingredients tRPC procedures (PRD-122).
 *
 * Thin wrappers over the food domain services exposed by `@pops/app-food/db`.
 * Validation lives in zod input schemas; business invariants (slug shape,
 * hierarchy depth, cycle detection) live in the service layer and are
 * mapped to typed TRPCErrors here so clients can switch on `code`.
 */
import {
  IngredientCycleError,
  IngredientHierarchyDepthExceeded,
  ingredientsQueries,
  ingredientsService,
  InvalidSlugError,
  SlugAlreadyRegisteredError,
} from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

const UNIT_ENUM = z.enum(['g', 'ml', 'count']);

function mapServiceError(err: unknown): never {
  if (err instanceof InvalidSlugError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  if (err instanceof SlugAlreadyRegisteredError) {
    throw new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
  }
  if (err instanceof IngredientCycleError || err instanceof IngredientHierarchyDepthExceeded) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  throw err as Error;
}

export const ingredientsRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), parentId: z.number().nullable().optional() }))
    .query(({ input }) => ({ items: ingredientsQueries.listIngredients(getDrizzle(), input) })),

  get: protectedProcedure
    .input(z.object({ idOrSlug: z.union([z.number(), z.string()]) }))
    .query(({ input }) => {
      const db = getDrizzle();
      const ing =
        typeof input.idOrSlug === 'number'
          ? ingredientsQueries.getIngredient(db, input.idOrSlug)
          : ingredientsQueries.getIngredientBySlug(db, input.idOrSlug);
      if (ing === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ingredient not found' });
      }
      return {
        ingredient: ing,
        variants: ingredientsQueries.listVariantsForIngredient(db, ing.id),
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
        name: z.string().min(1),
        defaultUnit: UNIT_ENUM,
        parentId: z.number().nullable().optional(),
        densityGPerMl: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      try {
        return ingredientsService.createIngredient(getDrizzle(), input);
      } catch (err) {
        mapServiceError(err);
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        defaultUnit: UNIT_ENUM.optional(),
        densityGPerMl: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      return ingredientsService.updateIngredient(getDrizzle(), id, patch);
    }),

  rename: protectedProcedure
    .input(z.object({ oldSlug: z.string(), newSlug: z.string() }))
    .mutation(({ input }) => {
      try {
        return ingredientsService.renameIngredientSlug(getDrizzle(), input.oldSlug, input.newSlug);
      } catch (err) {
        mapServiceError(err);
      }
    }),

  changeParent: protectedProcedure
    .input(z.object({ id: z.number(), newParentId: z.number().nullable() }))
    .mutation(({ input }) => {
      try {
        return ingredientsService.changeIngredientParent(getDrizzle(), input.id, input.newParentId);
      } catch (err) {
        mapServiceError(err);
      }
    }),

  blockers: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => ingredientsQueries.getIngredientDeleteBlockers(getDrizzle(), input.id)),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    const db = getDrizzle();
    const blockers = ingredientsQueries.getIngredientDeleteBlockers(db, input.id);
    if (blockers.variants > 0 || blockers.aliases > 0) {
      return { ok: false as const, blockers };
    }
    ingredientsService.deleteIngredient(db, input.id);
    return { ok: true as const };
  }),
});
