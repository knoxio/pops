import { z } from 'zod';

import { protectedProcedure, router } from '../../../trpc.js';
import { semanticSearch, getEmbeddingStatus, reindexEmbeddings } from './service.js';

export const embeddingsRouter = router({
  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        sourceTypes: z.array(z.string()).optional(),
        limit: z.number().int().positive().max(100).default(10),
        threshold: z.number().min(0).max(2).default(1.0),
      })
    )
    .query(async ({ input }) => {
      const results = await semanticSearch(input.query, {
        sourceTypes: input.sourceTypes,
        limit: input.limit,
        threshold: input.threshold,
      });
      return { results };
    }),

  status: protectedProcedure
    .input(z.object({ sourceType: z.string().optional() }))
    .query(({ input }) => {
      return getEmbeddingStatus(input.sourceType);
    }),

  reindex: protectedProcedure
    .input(
      z.object({
        sourceType: z.string(),
        sourceIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const enqueued = await reindexEmbeddings(input.sourceType, input.sourceIds);
      return { enqueued };
    }),
});
