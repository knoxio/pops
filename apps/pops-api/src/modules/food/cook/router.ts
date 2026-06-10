/**
 * `food.cook.*` tRPC router — PRD-144 behaviour.
 *
 * Two procedures:
 *   - `prepareCook` (query) — modal-open pre-flight (see `./prepare.ts`)
 *   - `markCooked` (mutation) — single-transaction cook event (see
 *     `./mark-cooked.ts` and `./mark-cooked-overrides.ts`)
 */
import { TRPCError } from '@trpc/server';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { MarkCookedInputSchema, PrepareCookInputSchema } from './inputs.js';
import { markCooked } from './mark-cooked.js';
import { prepareCook, PrepareCookError } from './prepare.js';

import type { CookPreparation, MarkCookedResult } from '@pops/app-food-db';

export const cookRouter = router({
  prepareCook: protectedProcedure
    .input(PrepareCookInputSchema)
    .query(({ input }): CookPreparation => {
      try {
        return prepareCook(getDrizzle(), {
          recipeVersionId: input.recipeVersionId,
          planEntryId: input.planEntryId,
        });
      } catch (err) {
        if (err instanceof PrepareCookError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.reason });
        }
        throw err;
      }
    }),

  markCooked: protectedProcedure
    .input(MarkCookedInputSchema)
    .mutation(({ input }): MarkCookedResult => {
      return markCooked(getDrizzle(), input);
    }),
});
