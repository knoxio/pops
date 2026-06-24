/**
 * ts-rest contract for `cerebrum.ingest.*`.
 *
 * The ingestion pipeline: normalise → classify → extract entities → infer
 * scopes → write. Non-identity domain — served on the docker-network trust
 * boundary with no per-request auth (parity with engrams / templates). The
 * pipeline is LLM- and queue-heavy; the container injects a real Anthropic
 * client + curation queue in `server.ts` and fakes/no-Redis in tests.
 *
 * Every procedure is POST: all inputs are typed bodies (the read-shaped
 * `classify` / `preview` / `inferScopes` carry their body text and arrays in
 * the request body rather than the query string, mirroring the food + engrams
 * precedent). The wire schemas live in the pure `rest-ingest-schemas.ts`
 * module so the contract and the lifted service share one source of truth.
 */
import { initContract } from '@ts-rest/core';

import {
  ingestClassifyBodySchema,
  ingestEngramIdBodySchema,
  ingestEnrichmentStatusResponseSchema,
  ingestExtractEntitiesBodySchema,
  ingestExtractEntitiesResponseSchema,
  ingestInferScopesBodySchema,
  ingestPreviewResponseSchema,
  ingestQuickCaptureBodySchema,
  ingestQuickCaptureResponseSchema,
  ingestRetryEnrichmentResponseSchema,
  ingestSubmitBodySchema,
  ingestSubmitResponseSchema,
  classificationResultSchema,
  scopeInferenceResultSchema,
} from './rest-ingest-schemas.js';
import { errorBodySchema } from './rest-schemas.js';

const c = initContract();

export const cerebrumIngestContract = c.router({
  submit: {
    method: 'POST',
    path: '/ingest/submit',
    summary: 'Run the full ingestion pipeline and write an engram.',
    body: ingestSubmitBodySchema,
    responses: {
      200: ingestSubmitResponseSchema,
      400: errorBodySchema,
      404: errorBodySchema,
    },
  },
  preview: {
    method: 'POST',
    path: '/ingest/preview',
    summary: 'Dry-run the ingestion pipeline without writing an engram.',
    body: ingestSubmitBodySchema,
    responses: {
      200: ingestPreviewResponseSchema,
      400: errorBodySchema,
    },
  },
  classify: {
    method: 'POST',
    path: '/ingest/classify',
    summary: 'Classify content into a known engram type.',
    body: ingestClassifyBodySchema,
    responses: {
      200: classificationResultSchema,
      400: errorBodySchema,
    },
  },
  extractEntities: {
    method: 'POST',
    path: '/ingest/extract-entities',
    summary: 'Extract named entities + tags + referenced dates from content.',
    body: ingestExtractEntitiesBodySchema,
    responses: {
      200: ingestExtractEntitiesResponseSchema,
      400: errorBodySchema,
    },
  },
  inferScopes: {
    method: 'POST',
    path: '/ingest/infer-scopes',
    summary: 'Infer scopes for content (explicit → rules → LLM → fallback).',
    body: ingestInferScopesBodySchema,
    responses: {
      200: scopeInferenceResultSchema,
      400: errorBodySchema,
    },
  },
  quickCapture: {
    method: 'POST',
    path: '/ingest/quick-capture',
    summary: 'Store a raw capture and enqueue async enrichment.',
    body: ingestQuickCaptureBodySchema,
    responses: {
      200: ingestQuickCaptureResponseSchema,
      400: errorBodySchema,
    },
  },
  enrichmentStatus: {
    method: 'POST',
    path: '/ingest/enrichment-status',
    summary: 'Poll the async enrichment state of an engram.',
    body: ingestEngramIdBodySchema,
    responses: {
      200: ingestEnrichmentStatusResponseSchema,
      404: errorBodySchema,
    },
  },
  retryEnrichment: {
    method: 'POST',
    path: '/ingest/retry-enrichment',
    summary: 'Re-enqueue the classifyEngram job for an engram.',
    body: ingestEngramIdBodySchema,
    responses: {
      200: ingestRetryEnrichmentResponseSchema,
      404: errorBodySchema,
    },
  },
});

export type CerebrumIngestContract = typeof cerebrumIngestContract;
