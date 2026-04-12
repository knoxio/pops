/**
 * Search tRPC router — exposes search query and show-more as protected procedures.
 */
import { z } from 'zod';

import { protectedProcedure, router } from '../../../trpc.js';
import { searchAll, showMore } from './engine.js';

const SearchContextSchema = z
  .object({
    app: z.string().nullable().default(null),
    page: z.string().nullable().default(null),
  })
  .optional()
  .default({});

export const searchRouter = router({
  /** Search across all domains — returns grouped sections */
  query: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1),
        context: SearchContextSchema,
      })
    )
    .query(async ({ input }) => {
      const context = {
        app: input.context?.app ?? null,
        page: input.context?.page ?? null,
      };
      const result = await searchAll({ text: input.text }, context);
      return result;
    }),

  /** Load more results for a single domain */
  showMore: protectedProcedure
    .input(
      z.object({
        domain: z.string().min(1),
        text: z.string().min(1),
        context: SearchContextSchema,
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const context = {
        app: input.context?.app ?? null,
        page: input.context?.page ?? null,
      };
      const result = await showMore(input.domain, { text: input.text }, context, input.offset);
      return result;
    }),
});
