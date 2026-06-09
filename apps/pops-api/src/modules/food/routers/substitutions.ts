import { TRPCError } from '@trpc/server';
import { z } from 'zod';

/**
 * Food → substitutions tRPC procedures (PRD-122 + PRD-109).
 *
 * Endpoints are XOR-shaped: exactly one of `ingredientId` / `variantId` on
 * each side. The service layer's `assertEndpointShape` enforces this and
 * surfaces `CannotSubstituteSelf` for from = to identity checks; both come
 * back to the client as BAD_REQUEST.
 */
import {
  CannotSubstituteSelf,
  substitutionsQueries,
  substitutionsService,
} from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

const ENDPOINT_SCHEMA = z.object({
  ingredientId: z.number().optional(),
  variantId: z.number().optional(),
});

const SCOPE_ENUM = z.enum(['global', 'recipe']);

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

  create: protectedProcedure
    .input(
      z.object({
        from: ENDPOINT_SCHEMA,
        to: ENDPOINT_SCHEMA,
        ratio: z.number().positive().optional(),
        contextTags: z.array(z.string()).optional(),
        scope: SCOPE_ENUM.optional(),
        recipeId: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      try {
        return substitutionsService.createSubstitution(getDrizzle(), input);
      } catch (err) {
        if (err instanceof CannotSubstituteSelf) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
        }
        throw err as Error;
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        ratio: z.number().positive().optional(),
        contextTags: z.array(z.string()).optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      return substitutionsQueries.updateSubstitution(getDrizzle(), id, patch);
    }),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    substitutionsService.deleteSubstitution(getDrizzle(), input.id);
    return { ok: true as const };
  }),
});
