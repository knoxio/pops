/**
 * cerebrum.retrieval tRPC router — unified retrieval API (search, context,
 * similar, stats).
 *
 * Procedures:
 *   search  — semantic | structured | hybrid (default)
 *   context — hybrid search + context window assembly for LLM consumption
 *   similar — k-NN from an existing engram's vector (no re-embedding)
 *   stats   — retrieval layer health and coverage counts
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { embeddings, engramIndex } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { ContextAssemblyService } from './context-assembly.js';
import { HybridSearchService } from './hybrid-search.js';

import type { RetrievalFilters } from './types.js';

const filtersSchema = z
  .object({
    types: z.array(z.string()).optional(),
    scopes: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    dateRange: z.object({ from: z.string().optional(), to: z.string().optional() }).optional(),
    status: z.array(z.string()).optional(),
    sourceTypes: z.array(z.string()).optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
    includeSecret: z.boolean().optional(),
  })
  .optional();

export const retrievalRouter = router({
  /**
   * Unified search endpoint. Routes to semantic, structured, or hybrid (default).
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().optional(),
        mode: z.enum(['semantic', 'structured', 'hybrid']).default('hybrid'),
        filters: filtersSchema,
        limit: z.number().int().positive().max(100).default(20),
        threshold: z.number().min(0).max(2).default(0.8),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = getDrizzle();
      const svc = new HybridSearchService(db);
      const filters: RetrievalFilters = input.filters ?? {};

      if (input.mode === 'semantic' || input.mode === 'hybrid') {
        if (!input.query?.trim()) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Query is required for semantic and hybrid search modes',
          });
        }
      }

      if (input.mode === 'structured') {
        const hasFilters =
          filters.types?.length ||
          filters.scopes?.length ||
          filters.tags?.length ||
          filters.dateRange?.from ||
          filters.dateRange?.to ||
          filters.status?.length ||
          filters.customFields;
        if (!hasFilters) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Structured search requires at least one filter',
          });
        }
      }

      // query is guaranteed non-empty for semantic/hybrid by the guard above
      const query = input.query ?? '';

      let results;
      switch (input.mode) {
        case 'semantic':
          results = await svc.semanticSearch(query, filters, input.limit, input.threshold);
          break;
        case 'structured':
          results = svc.structuredOnly(filters, input.limit, input.offset);
          break;
        case 'hybrid':
        default:
          results = await svc.hybrid(query, filters, input.limit, input.threshold);
      }

      return {
        results,
        meta: {
          total: results.length,
          mode: input.mode,
        },
      };
    }),

  /**
   * Assemble a token-budgeted context window for LLM consumption.
   * Runs hybrid search internally, then assembles and returns formatted context.
   */
  context: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        filters: filtersSchema,
        tokenBudget: z.number().int().positive().default(4096),
        includeMetadata: z.boolean().default(true),
        maxResults: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      if (!input.query.trim()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Query is required for context assembly',
        });
      }

      const db = getDrizzle();
      const svc = new HybridSearchService(db);
      const assembler = new ContextAssemblyService();
      const filters: RetrievalFilters = input.filters ?? {};

      const results = await svc.hybrid(input.query, filters, input.maxResults, 0.8);
      const output = assembler.assemble({
        query: input.query,
        results,
        tokenBudget: input.tokenBudget,
        includeMetadata: input.includeMetadata,
      });

      return output;
    }),

  /**
   * Find engrams similar to the given engram by its existing embedding vector.
   * Does not call the embedding API — reads the vector directly.
   */
  similar: protectedProcedure
    .input(
      z.object({
        engramId: z.string(),
        limit: z.number().int().positive().max(100).default(20),
        threshold: z.number().min(0).max(2).default(0.8),
        filters: filtersSchema,
      })
    )
    .query(async ({ input }) => {
      const db = getDrizzle();
      const svc = new HybridSearchService(db);
      const filters: RetrievalFilters = input.filters ?? {};

      const results = await svc.similar(input.engramId, filters, input.limit, input.threshold);
      return { results };
    }),

  /**
   * Retrieval layer health and coverage counts.
   */
  stats: protectedProcedure.query(() => {
    const db = getDrizzle();

    const indexed = db.select().from(engramIndex).all().length;

    const embeddingRows = db.select().from(embeddings).all();
    const embedded = embeddingRows.length;

    const sourceTypeCounts = embeddingRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.sourceType] = (acc[row.sourceType] ?? 0) + 1;
      return acc;
    }, {});

    const lastUpdated =
      embeddingRows
        .map((r) => r.createdAt)
        .toSorted()
        .at(-1) ?? null;

    return {
      indexed,
      embedded,
      sourceTypes: sourceTypeCounts,
      lastUpdated,
    };
  }),
});
