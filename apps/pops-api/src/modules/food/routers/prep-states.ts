import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  InvalidSlugError,
  prepStatesService as legacyPrepStatesService,
  SlugAlreadyRegisteredError,
} from '@pops/app-food-db';
import { prepStatesService } from '@pops/food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

/**
 * `food.prepStates` tRPC router.
 *
 * Reads (`listPrepStates`) are sourced from the pillar package
 * `@pops/food-db`. The `createPrepState` mutation and its slug-registry
 * typed errors (`InvalidSlugError`, `SlugAlreadyRegisteredError`) still
 * live in `@pops/app-food-db` because the slug-registry + transaction
 * helpers haven't been extracted into the pillar package yet.
 */
export const prepStatesRouter = router({
  list: protectedProcedure.query(() => ({
    items: prepStatesService.listPrepStates(getDrizzle()),
  })),

  create: protectedProcedure
    .input(z.object({ slug: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => {
      try {
        return legacyPrepStatesService.createPrepState(getDrizzle(), input);
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
