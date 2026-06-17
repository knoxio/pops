/**
 * Wire schemas for `cerebrum.query.*` (PRD-082 NL Q&A engine).
 *
 * The query surface returns well-bounded shapes (answer text + citation rows +
 * scope/plan scalars), so unlike emit there is no opaque-record escape hatch
 * here — every field is typed. The `retrievalPlan.filters` shape reuses the
 * retrieval domain's filter schema.
 *
 * Lives in its own file (not the shared `rest-schemas.ts`) so that file stays
 * under the oxlint `max-lines: 200` cap; no other domain consumes these.
 */
import { z } from 'zod';

import { retrievalFiltersSchema } from './rest-retrieval-schemas.js';

export const queryDomainSchema = z.enum(['engrams', 'transactions', 'media', 'inventory']);
export type QueryDomainWire = z.infer<typeof queryDomainSchema>;

export const queryConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type QueryConfidenceWire = z.infer<typeof queryConfidenceSchema>;

export const queryScopeInferenceSourceSchema = z.enum(['explicit', 'inferred', 'default']);

/** A single source-citation row attached to a query answer. */
export const querySourceCitationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  excerpt: z.string(),
  relevance: z.number(),
  scope: z.string(),
});
export type QuerySourceCitationWire = z.infer<typeof querySourceCitationSchema>;

export const queryAskBodySchema = z.object({
  question: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  includeSecret: z.boolean().optional(),
  maxSources: z.number().int().positive().max(50).optional(),
  domains: z.array(queryDomainSchema).optional(),
});
export type QueryAskBodyWire = z.infer<typeof queryAskBodySchema>;

export const queryRetrieveBodySchema = z.object({
  question: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  includeSecret: z.boolean().optional(),
  maxSources: z.number().int().positive().max(50).optional(),
});
export type QueryRetrieveBodyWire = z.infer<typeof queryRetrieveBodySchema>;

export const queryExplainBodySchema = z.object({
  question: z.string().min(1),
});
export type QueryExplainBodyWire = z.infer<typeof queryExplainBodySchema>;

/** Body accepted by the SSE `/query/stream` route — `ask` body + `domains`. */
export const queryStreamBodySchema = queryAskBodySchema;
export type QueryStreamBodyWire = z.infer<typeof queryStreamBodySchema>;

export const queryAskResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(querySourceCitationSchema),
  scopes: z.array(z.string()),
  confidence: queryConfidenceSchema,
});

export const queryRetrieveResponseSchema = z.object({
  sources: z.array(querySourceCitationSchema),
});

export const queryExplainResponseSchema = z.object({
  scopeInference: z.object({
    scopes: z.array(z.string()),
    source: queryScopeInferenceSourceSchema,
  }),
  retrievalPlan: z.object({
    filters: retrievalFiltersSchema,
    maxSources: z.number().int(),
    threshold: z.number(),
  }),
  secretNotice: z.string().nullable(),
});
