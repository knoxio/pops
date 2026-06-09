import { z } from 'zod';

import { slugSearchService } from '@pops/app-food-db';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';

const SLUG_KIND = z.enum(['ingredient', 'recipe', 'prep_state']);

export const slugsRouter = router({
  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        kinds: z.array(SLUG_KIND).optional(),
        limit: z.number().int().positive().max(100).optional(),
      })
    )
    .query(({ input }) => ({
      items: slugSearchService.searchSlugs(getDrizzle(), input),
    })),
});
