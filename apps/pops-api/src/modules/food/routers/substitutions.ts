import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  CannotSubstituteSelf,
  substitutionsQueries,
  substitutionsService,
} from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

/**
 * Food → substitutions tRPC procedures (PRD-122 + PRD-109).
 *
 * Endpoints are XOR-shaped: exactly one of `ingredientId` / `variantId` on
 * each side. Validation runs at the boundary so client mistakes surface
 * as BAD_REQUEST instead of an opaque INTERNAL_SERVER_ERROR after the
 * SQLite CHECK fires. Scope/recipeId coherence (`recipe` iff `recipeId`
 * set) is enforced here too — the schema has its own CHECK as a backstop.
 */

const ENDPOINT_SCHEMA = z
  .object({
    ingredientId: z.number().optional(),
    variantId: z.number().optional(),
  })
  .refine(
    (v) =>
      (v.ingredientId !== undefined && v.variantId === undefined) ||
      (v.ingredientId === undefined && v.variantId !== undefined),
    { message: 'endpoint must set exactly one of ingredientId or variantId' }
  );

const SCOPE_ENUM = z.enum(['global', 'recipe']);

const CREATE_INPUT = z
  .object({
    from: ENDPOINT_SCHEMA,
    to: ENDPOINT_SCHEMA,
    ratio: z.number().positive().optional(),
    contextTags: z.array(z.string()).optional(),
    scope: SCOPE_ENUM.optional(),
    recipeId: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (v) => {
      const scope = v.scope ?? 'global';
      if (scope === 'recipe') return v.recipeId !== undefined && v.recipeId !== null;
      return v.recipeId === undefined || v.recipeId === null;
    },
    { message: 'scope="recipe" requires recipeId; scope="global" must omit recipeId' }
  );

const UPDATE_INPUT = z
  .object({
    id: z.number(),
    ratio: z.number().positive().optional(),
    contextTags: z.array(z.string()).optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'id' && v[k as keyof typeof v] !== undefined), {
    message: 'patch must include at least one field besides id',
  });

export const substitutionsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          fromIngredientId: z.number().optional(),
          fromVariantId: z.number().optional(),
          scope: SCOPE_ENUM.optional(),
          recipeId: z.number().optional(),
          contextTag: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => ({
      items: substitutionsQueries.listSubstitutions(getDrizzle(), input ?? {}),
    })),

  create: protectedProcedure.input(CREATE_INPUT).mutation(({ input }) => {
    try {
      return substitutionsService.createSubstitution(getDrizzle(), input);
    } catch (err) {
      if (err instanceof CannotSubstituteSelf) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
      }
      throw err as Error;
    }
  }),

  update: protectedProcedure.input(UPDATE_INPUT).mutation(({ input }) => {
    const { id, ...patch } = input;
    return substitutionsQueries.updateSubstitution(getDrizzle(), id, patch);
  }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    substitutionsService.deleteSubstitution(getDrizzle(), input.id);
    return { ok: true as const };
  }),
});
