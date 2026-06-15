import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  IngredientCycleError,
  IngredientHierarchyDepthExceeded,
  ingredientsQueries,
  ingredientsService,
  InvalidSlugError,
  SlugAlreadyRegisteredError,
} from '@pops/app-food-db';

import { getFoodDrizzle } from '../../../db/food-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { ingredientTagsRouter } from './ingredient-tags.js';

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
  // Surface SQLite FK violations as a structured CONFLICT — the blocker
  // enumeration below intentionally only covers variants + aliases, but
  // recipe_lines / recipe_versions.yield_ingredient_id / substitutions
  // also reference ingredients. A FK error here means the row is in use
  // somewhere we didn't enumerate; bubble it up cleanly rather than 500.
  if (isSqliteForeignKeyError(err)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Ingredient is referenced by other rows in the food schema',
      cause: err,
    });
  }
  throw err as Error;
}

function isSqliteForeignKeyError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
  );
}

const UPDATE_INPUT = z
  .object({
    id: z.number(),
    name: z.string().min(1).optional(),
    defaultUnit: UNIT_ENUM.optional(),
    densityGPerMl: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'id' && v[k as keyof typeof v] !== undefined), {
    message: 'patch must include at least one field besides id',
  });

export const ingredientsRouter = router({
  tags: ingredientTagsRouter,

  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), parentId: z.number().nullable().optional() }))
    .query(({ input }) => {
      const items = ingredientsQueries.listIngredients(getFoodDrizzle(), input);
      // Stable order so the UI doesn't re-paint on every refetch and tests
      // can assert against a deterministic sequence. Sorting in JS is fine
      // at this scale (the canonical ingredient set is hundreds, not
      // millions, of rows).
      return {
        items: [...items].toSorted((a, b) => a.slug.localeCompare(b.slug)),
      };
    }),

  get: protectedProcedure
    .input(z.object({ idOrSlug: z.union([z.number(), z.string()]) }))
    .query(({ input }) => {
      const db = getFoodDrizzle();
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
        return ingredientsService.createIngredient(getFoodDrizzle(), input);
      } catch (err) {
        mapServiceError(err);
      }
    }),

  update: protectedProcedure.input(UPDATE_INPUT).mutation(({ input }) => {
    const { id, ...patch } = input;
    return ingredientsService.updateIngredient(getFoodDrizzle(), id, patch);
  }),

  rename: protectedProcedure
    .input(z.object({ oldSlug: z.string(), newSlug: z.string() }))
    .mutation(({ input }) => {
      try {
        return ingredientsService.renameIngredientSlug(
          getFoodDrizzle(),
          input.oldSlug,
          input.newSlug
        );
      } catch (err) {
        mapServiceError(err);
      }
    }),

  changeParent: protectedProcedure
    .input(z.object({ id: z.number(), newParentId: z.number().nullable() }))
    .mutation(({ input }) => {
      try {
        return ingredientsService.changeIngredientParent(
          getFoodDrizzle(),
          input.id,
          input.newParentId
        );
      } catch (err) {
        mapServiceError(err);
      }
    }),

  blockers: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) =>
      ingredientsQueries.getIngredientDeleteBlockers(getFoodDrizzle(), input.id)
    ),

  recipeRefs: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) =>
      ingredientsQueries.getRecipeRefsForIngredient(getFoodDrizzle(), input.id)
    ),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    const db = getFoodDrizzle();
    const blockers = ingredientsQueries.getIngredientDeleteBlockers(db, input.id);
    if (blockers.variants > 0 || blockers.aliases > 0) {
      return { ok: false as const, blockers };
    }
    try {
      ingredientsService.deleteIngredient(db, input.id);
    } catch (err) {
      mapServiceError(err);
    }
    return { ok: true as const };
  }),
});
