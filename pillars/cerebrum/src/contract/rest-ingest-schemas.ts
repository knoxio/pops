/**
 * Ingest wire schemas (PRD-081).
 *
 * PURE zod module — no ts-rest, no Express. Imported by BOTH the ingest
 * contract (`rest-ingest.ts`) and the lifted handlers/service so the request
 * bodies and response shapes have a single source of truth (mirrors the food
 * pillar's split). `rest-schemas.ts` holds the cross-domain shared envelopes
 * (`engramSchema`, `scopeSuggestionSchema`); this file holds the ingest-only
 * request/result shapes.
 *
 * `source` rides as a free string at the contract edge and is validated
 * server-side against the engram source grammar (parity with `engrams.create`)
 * — a bad channel surfaces as 400 rather than corrupting frontmatter.
 */
import { z } from 'zod';

import { engramSchema, scopeSuggestionSchema } from './rest-schemas.js';

const customFieldsSchema = z.record(z.string(), z.unknown());

export const ingestSubmitBodySchema = z.object({
  body: z.string().min(1),
  title: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  template: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  customFields: customFieldsSchema.optional(),
});
export type IngestSubmitBody = z.infer<typeof ingestSubmitBodySchema>;

export const ingestClassifyBodySchema = z.object({
  body: z.string().min(1),
  title: z.string().min(1).optional(),
});
export type IngestClassifyBody = z.infer<typeof ingestClassifyBodySchema>;

export const ingestExtractEntitiesBodySchema = z.object({
  body: z.string().min(1),
  existingTags: z.array(z.string().min(1)).optional(),
});
export type IngestExtractEntitiesBody = z.infer<typeof ingestExtractEntitiesBodySchema>;

export const ingestInferScopesBodySchema = z.object({
  body: z.string().min(1),
  type: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
  source: z.string().min(1).optional(),
  explicitScopes: z.array(z.string().min(1)).optional(),
  knownScopes: z.array(z.string().min(1)).optional(),
});
export type IngestInferScopesBody = z.infer<typeof ingestInferScopesBodySchema>;

export const ingestQuickCaptureBodySchema = z.object({
  text: z.string().min(1),
  source: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).optional(),
});
export type IngestQuickCaptureBody = z.infer<typeof ingestQuickCaptureBodySchema>;

export const ingestEngramIdBodySchema = z.object({
  engramId: z.string().min(1),
});
export type IngestEngramIdBody = z.infer<typeof ingestEngramIdBodySchema>;

const scopeSourceSchema = z.enum(['explicit', 'rules', 'llm', 'fallback']);

export const classificationResultSchema = z.object({
  type: z.string(),
  confidence: z.number(),
  template: z.string().nullable(),
  suggestedTags: z.array(z.string()),
});
export type ClassificationResultWire = z.infer<typeof classificationResultSchema>;

const entityTypeSchema = z.enum(['person', 'project', 'date', 'topic', 'organisation']);

export const extractedEntitySchema = z.object({
  type: entityTypeSchema,
  value: z.string(),
  normalised: z.string(),
  confidence: z.number(),
});
export type ExtractedEntityWire = z.infer<typeof extractedEntitySchema>;

export const scopeInferenceResultSchema = z.object({
  scopes: z.array(z.string()),
  source: scopeSourceSchema,
  confidence: z.number(),
});
export type ScopeInferenceResultWire = z.infer<typeof scopeInferenceResultSchema>;

export const ingestSubmitResponseSchema = z.object({
  engram: engramSchema,
  classification: classificationResultSchema.nullable(),
  entities: z.array(extractedEntitySchema),
  scopeInference: scopeInferenceResultSchema,
});
export type IngestSubmitResponseWire = z.infer<typeof ingestSubmitResponseSchema>;

export const ingestPreviewResponseSchema = z.object({
  normalisedBody: z.string(),
  classification: classificationResultSchema.nullable(),
  entities: z.array(extractedEntitySchema),
  referencedDates: z.array(z.string()),
  scopeInference: scopeInferenceResultSchema,
});
export type IngestPreviewResponseWire = z.infer<typeof ingestPreviewResponseSchema>;

export const ingestExtractEntitiesResponseSchema = z.object({
  entities: z.array(extractedEntitySchema),
  tags: z.array(z.string()),
  referencedDates: z.array(z.string()),
});
export type IngestExtractEntitiesResponseWire = z.infer<typeof ingestExtractEntitiesResponseSchema>;

export const ingestQuickCaptureResponseSchema = z.object({
  id: z.string(),
  path: z.string(),
  type: z.string(),
  scopes: z.array(z.string()),
  requeued: z.boolean(),
});
export type IngestQuickCaptureResponseWire = z.infer<typeof ingestQuickCaptureResponseSchema>;

export const ingestEnrichmentStatusResponseSchema = z.object({
  enriched: z.boolean(),
  type: z.string(),
  template: z.string().nullable(),
  scopes: z.array(z.string()),
  tags: z.array(z.string()),
  scopeSuggestions: z.array(scopeSuggestionSchema),
});
export type IngestEnrichmentStatusResponseWire = z.infer<
  typeof ingestEnrichmentStatusResponseSchema
>;

export const ingestRetryEnrichmentResponseSchema = z.object({
  engramId: z.string(),
  requeued: z.boolean(),
});
export type IngestRetryEnrichmentResponseWire = z.infer<typeof ingestRetryEnrichmentResponseSchema>;
