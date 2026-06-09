import { TRPCError } from '@trpc/server';
import { z } from 'zod';

/**
 * Food → prepStates tRPC procedures (PRD-122).
 *
 * v1 deliberately omits update/delete — the PRD calls out that prep_states
 * have heavy reference impact and deletion requires cascade analysis that's
 * deferred to a future PRD.
 */
import { InvalidSlugError, prepStatesService, SlugAlreadyRegisteredError } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

export const prepStatesRouter = router({
  list: protectedProcedure.query(() => ({ items: prepStatesService.listPrepStates(getDrizzle()) })),

  create: protectedProcedure
    .input(z.object({ slug: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => {
      try {
        return prepStatesService.createPrepState(getDrizzle(), input);
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
