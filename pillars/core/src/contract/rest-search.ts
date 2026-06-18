/**
 * `search.*` sub-router — the core pillar's slice of unified search.
 *
 * Ported from the monolith's static `search-adapters.ts` binding: the
 * orchestrator federates search by POSTing the same `{ query, context? }`
 * envelope to every installed pillar's `/search` endpoint and merges the
 * returned `hits`. This contract describes core's slice — the `entities`
 * adapter (`apps/pops-api/src/modules/core/entities/search-adapter.ts`).
 *
 * The `Query` / `SearchContext` / `SearchHit` zod shapes mirror the
 * cross-package `@pops/types` search contract (`packages/types/src/search.ts`)
 * so the wire shape the orchestrator sends/merges is byte-identical to the
 * in-process adapter contract it replaces. `data` is left as a permissive
 * record because each adapter carries its own domain-specific hit payload —
 * the engine treats it as opaque.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/** A structured filter for advanced query syntax. Mirrors `StructuredFilter` in `@pops/types`. */
export const StructuredFilterSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.string(),
});

/** A user search query. Mirrors `Query` in `@pops/types`. */
export const QuerySchema = z.object({
  text: z.string(),
  filters: z.array(StructuredFilterSchema).optional(),
});

/** Context about where search is invoked from. Mirrors `SearchContext` in `@pops/types`. */
export const SearchContextSchema = z.object({
  app: z.string().nullable(),
  page: z.string().nullable(),
  entity: z
    .object({
      uri: z.string(),
      type: z.string(),
      title: z.string(),
    })
    .optional(),
  filters: z.record(z.string(), z.string()).optional(),
});

/** How a search hit was matched against the query. Mirrors `MatchType` in `@pops/types`. */
export const MatchTypeSchema = z.enum(['exact', 'prefix', 'contains']);

/**
 * A single ranked search result. Mirrors `SearchHit` in `@pops/types`. `data`
 * is the domain-specific payload, opaque to the engine/orchestrator, so it is
 * typed as a permissive record on the wire.
 */
export const SearchHitSchema = z.object({
  uri: z.string(),
  score: z.number(),
  matchField: z.string(),
  matchType: MatchTypeSchema,
  data: z.record(z.string(), z.unknown()),
});

const SearchBody = z.object({
  query: QuerySchema,
  context: SearchContextSchema.optional(),
});

export const coreSearchContract = c.router({
  search: {
    method: 'POST',
    path: '/search',
    body: SearchBody,
    responses: {
      200: z.object({ hits: z.array(SearchHitSchema) }),
    },
    summary: "Search the core pillar's domains (entities) for the unified search engine",
  },
});
