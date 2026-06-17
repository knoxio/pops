/**
 * Wire schemas for `cerebrum.retrieval.*`.
 *
 * The retrieval surface returns deep aggregates — a `RetrievalResult` carries a
 * free-form `metadata` bag whose keys depend on the source type (engram
 * frontmatter vs. cross-pillar domain rows), so it is projected as
 * `z.record(z.string(), z.unknown())` rather than a closed shape (mirrors how
 * food projected its deep recipe aggregates). The scalar/identity fields stay
 * strongly typed.
 *
 * Lives in its own file (not the shared `rest-schemas.ts`) so that file stays
 * under the oxlint `max-lines: 200` cap; no other domain consumes these.
 */
import { z } from 'zod';

export const retrievalModeSchema = z.enum(['semantic', 'structured', 'hybrid']);
export type RetrievalModeWire = z.infer<typeof retrievalModeSchema>;

export const retrievalFiltersSchema = z.object({
  types: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  dateRange: z.object({ from: z.string().optional(), to: z.string().optional() }).optional(),
  status: z.array(z.string()).optional(),
  sourceTypes: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  includeSecret: z.boolean().optional(),
});
export type RetrievalFiltersWire = z.infer<typeof retrievalFiltersSchema>;

/**
 * A single retrieval hit. `metadata` is an open bag — engram hits carry
 * `type`/`scopes`/`tags`/`wordCount`/…, cross-pillar hits carry the enriched
 * domain fields. Modelled as an opaque record so the contract doesn't have to
 * enumerate every source type's projection.
 */
export const retrievalResultSchema = z.object({
  sourceType: z.string(),
  sourceId: z.string(),
  title: z.string(),
  contentPreview: z.string(),
  score: z.number(),
  distance: z.number().optional(),
  matchType: z.enum(['semantic', 'structured', 'both']),
  metadata: z.record(z.string(), z.unknown()),
});
export type RetrievalResultWire = z.infer<typeof retrievalResultSchema>;

/** A context-window source attribution row. */
export const sourceAttributionSchema = z.object({
  sourceType: z.string(),
  sourceId: z.string(),
  title: z.string(),
  relevanceScore: z.number(),
  chunkRange: z.tuple([z.number(), z.number()]).optional(),
});
export type SourceAttributionWire = z.infer<typeof sourceAttributionSchema>;

export const retrievalStatsSchema = z.object({
  indexed: z.number().int(),
  embedded: z.number().int(),
  sourceTypes: z.record(z.string(), z.number().int()),
  lastUpdated: z.string().nullable(),
});
export type RetrievalStatsWire = z.infer<typeof retrievalStatsSchema>;
