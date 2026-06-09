import { z } from 'zod';

/**
 * Food → slugs tRPC procedures (PRD-122 + PRD-120).
 *
 * Single source for slug autocomplete across the data page (global search)
 * and the DSL editor (PRD-120's `slug_registry` lookup). Keeps the surface
 * cheap so it can be polled on every keystroke client-side without paging.
 */
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
