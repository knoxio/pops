/**
 * Wire schemas for `cerebrum.emit.*` (PRD-083 document generation).
 *
 * The `GeneratedDocument` envelope is fully tractable (a closed scalar set, a
 * fixed `metadata` block, and typed source-citation rows), so it is enumerated
 * here rather than collapsed to an opaque record. The request inputs and the
 * `sources`/`outline` preview shape are likewise fully typed.
 *
 * Lives in its own file (not the shared `rest-schemas.ts`) so that file stays
 * under the oxlint `max-lines: 200` cap; no other domain consumes these.
 */
import { z } from 'zod';

export const generationModeSchema = z.enum(['report', 'summary', 'timeline']);
export type GenerationModeWire = z.infer<typeof generationModeSchema>;

export const generationGroupBySchema = z.enum(['type', 'month', 'quarter']);
export type GenerationGroupByWire = z.infer<typeof generationGroupBySchema>;

export const generationFormatSchema = z.enum(['markdown', 'plain']);

export const emitDateRangeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type EmitDateRangeWire = z.infer<typeof emitDateRangeSchema>;

/** A single source-citation row attached to a generated document. */
export const emitSourceCitationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  excerpt: z.string(),
  relevance: z.number(),
  scope: z.string(),
});
export type EmitSourceCitationWire = z.infer<typeof emitSourceCitationSchema>;

/** Per-generation metadata block attached to a document. */
export const generationMetadataSchema = z.object({
  sourceCount: z.number().int(),
  dateRange: emitDateRangeSchema.nullable(),
  scopeCoverage: z.array(z.string()),
  mode: generationModeSchema,
  truncated: z.boolean(),
});

/**
 * Wire projection of `GeneratedDocument`. The shape is fully tractable (closed
 * scalar set + a fixed `metadata` block + typed citation rows), so it is
 * enumerated rather than projected as an opaque record — there is no mode-
 * dependent variation in the document envelope itself.
 */
export const generatedDocumentSchema = z.object({
  title: z.string(),
  body: z.string(),
  mode: generationModeSchema,
  sources: z.array(emitSourceCitationSchema),
  audienceScope: z.string(),
  dateRange: emitDateRangeSchema.nullable(),
  metadata: generationMetadataSchema,
});
export type GeneratedDocumentWire = z.infer<typeof generatedDocumentSchema>;

export const emitGenerateBodySchema = z.object({
  mode: generationModeSchema,
  query: z.string().min(1).optional(),
  dateRange: emitDateRangeSchema.optional(),
  scopes: z.array(z.string().min(1)).optional(),
  audienceScope: z.string().min(1).optional(),
  includeSecret: z.boolean().optional(),
  types: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
  format: generationFormatSchema.optional(),
  groupBy: generationGroupBySchema.optional(),
});
export type EmitGenerateBodyWire = z.infer<typeof emitGenerateBodySchema>;

export const emitReportBodySchema = z.object({
  query: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  audienceScope: z.string().min(1).optional(),
  includeSecret: z.boolean().optional(),
  types: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});
export type EmitReportBodyWire = z.infer<typeof emitReportBodySchema>;

export const emitSummaryBodySchema = z.object({
  dateRange: emitDateRangeSchema,
  query: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).optional(),
  audienceScope: z.string().min(1).optional(),
  includeSecret: z.boolean().optional(),
  types: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});
export type EmitSummaryBodyWire = z.infer<typeof emitSummaryBodySchema>;

export const emitTimelineBodySchema = z.object({
  query: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).optional(),
  dateRange: emitDateRangeSchema.optional(),
  audienceScope: z.string().min(1).optional(),
  includeSecret: z.boolean().optional(),
  types: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
  groupBy: generationGroupBySchema.optional(),
});
export type EmitTimelineBodyWire = z.infer<typeof emitTimelineBodySchema>;

export const emitGenerateResponseSchema = z.object({
  document: generatedDocumentSchema.nullable(),
  notice: z.string().optional(),
});

export const emitDocumentResponseSchema = z.object({
  document: generatedDocumentSchema.nullable(),
});

export const emitPreviewResponseSchema = z.object({
  sources: z.array(emitSourceCitationSchema),
  outline: z.string(),
});
