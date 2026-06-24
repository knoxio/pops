/**
 * ts-rest contract for `cerebrum.retrieval.*` — the unified read surface
 * (search, context, similar, stats).
 *
 * The retrieval services are STATELESS: scope/type/status filtering rides in
 * the request body (`RetrievalFilters`), never derived from a caller identity.
 * The domain is therefore served on the docker-network trust boundary with no
 * per-request auth, like the other domains.
 *
 * `search` / `context` / `similar` are POST-with-body (they carry the filter
 * object and/or arrays that don't round-trip cleanly through a query string —
 * mirrors the engrams `search` + nudges `list` precedent). `stats` takes no
 * input and stays a GET.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  retrievalFiltersSchema,
  retrievalModeSchema,
  retrievalResultSchema,
  retrievalStatsSchema,
  sourceAttributionSchema,
} from './rest-retrieval-schemas.js';
import { errorBodySchema } from './rest-schemas.js';

const c = initContract();

const searchBody = z.object({
  query: z.string().optional(),
  mode: retrievalModeSchema.default('hybrid'),
  filters: retrievalFiltersSchema.optional(),
  limit: z.number().int().positive().max(100).default(20),
  threshold: z.number().min(0).max(2).default(0.8),
  offset: z.number().int().min(0).default(0),
});

const contextBody = z.object({
  query: z.string(),
  filters: retrievalFiltersSchema.optional(),
  tokenBudget: z.number().int().positive().default(4096),
  includeMetadata: z.boolean().default(true),
  maxResults: z.number().int().positive().max(100).default(20),
});

const similarBody = z.object({
  engramId: z.string(),
  limit: z.number().int().positive().max(100).default(20),
  threshold: z.number().min(0).max(2).default(0.8),
  filters: retrievalFiltersSchema.optional(),
});

export const cerebrumRetrievalContract = c.router({
  search: {
    method: 'POST',
    path: '/retrieval/search',
    summary: 'Unified search — semantic | structured | hybrid (default).',
    body: searchBody,
    responses: {
      200: z.object({
        results: z.array(retrievalResultSchema),
        meta: z.object({ total: z.number().int(), mode: retrievalModeSchema }),
      }),
      400: errorBodySchema,
    },
  },
  context: {
    method: 'POST',
    path: '/retrieval/context',
    summary: 'Assemble a token-budgeted context window for LLM consumption.',
    body: contextBody,
    responses: {
      200: z.object({
        context: z.string(),
        sources: z.array(sourceAttributionSchema),
        truncated: z.boolean(),
        tokenEstimate: z.number().int(),
      }),
      400: errorBodySchema,
    },
  },
  similar: {
    method: 'POST',
    path: '/retrieval/similar',
    summary: 'Find engrams similar to a given engram by its existing vector.',
    body: similarBody,
    responses: {
      200: z.object({ results: z.array(retrievalResultSchema) }),
      400: errorBodySchema,
    },
  },
  stats: {
    method: 'GET',
    path: '/retrieval/stats',
    summary: 'Retrieval layer health and coverage counts.',
    responses: {
      200: retrievalStatsSchema,
    },
  },
});
