import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  InvalidSlugError,
  prepStatesService as legacyPrepStatesService,
  SlugAlreadyRegisteredError,
} from '@pops/app-food-db';
import { prepStatesService } from '@pops/food-db';

import { getFoodDrizzle } from '../../../db/food-handle.js';
import { protectedProcedure, router } from '../../../trpc.js';

/**
 * `food.prepStates` tRPC router.
 *
 * Reads (`listPrepStates`) are sourced from the pillar package
 * `@pops/food-db` and run against the food pillar handle (phase 2
 * PR 3). The `createPrepState` mutation still calls into
 * `@pops/app-food-db` because the slug-registry transaction helpers
 * haven't been extracted into the pillar package yet, but both reads
 * and writes now resolve through `getFoodDrizzle()` so they land on
 * `food.db`. The boot-time `backfillFoodFromSharedDb` carries the
 * existing prep_states rows + their `kind='prep_state'` slug_registry
 * entries across so the mutation's slug-availability checks see the
 * full pre-cutover history.
 */
export const prepStatesRouter = router({
  list: protectedProcedure.query(() => ({
    items: prepStatesService.listPrepStates(getFoodDrizzle()),
  })),

  create: protectedProcedure
    .input(z.object({ slug: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => {
      try {
        return legacyPrepStatesService.createPrepState(getFoodDrizzle(), input);
      } catch (err) {
        if (err instanceof InvalidSlugError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
        }
        if (err instanceof SlugAlreadyRegisteredError) {
          throw new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
        }
        throw err as Error;
      }
    }),
});
