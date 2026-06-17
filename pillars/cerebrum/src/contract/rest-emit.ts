/**
 * ts-rest contract for `cerebrum.emit.*` — document generation (PRD-083).
 *
 * The generation pipeline is STATELESS: scope/audience/type filtering rides in
 * the request body, never derived from a caller identity. The domain is served
 * on the docker-network trust boundary with no per-request auth, like the other
 * migrated domains.
 *
 * Every procedure is POST (the bodies carry filter objects + arrays that don't
 * round-trip cleanly through a query string — mirrors the ingest + retrieval
 * precedent). The generated OpenAPI derives dotted operation ids
 * (`emit.generate`, …) from the router keys via `setOperationId`.
 */
import { initContract } from '@ts-rest/core';

import {
  emitDocumentResponseSchema,
  emitGenerateBodySchema,
  emitGenerateResponseSchema,
  emitPreviewResponseSchema,
  emitReportBodySchema,
  emitSummaryBodySchema,
  emitTimelineBodySchema,
} from './rest-emit-schemas.js';
import { errorBodySchema } from './rest-schemas.js';

const c = initContract();

export const cerebrumEmitContract = c.router({
  generate: {
    method: 'POST',
    path: '/emit/generate',
    summary: 'Run the full document-generation pipeline for any mode.',
    body: emitGenerateBodySchema,
    responses: {
      200: emitGenerateResponseSchema,
      400: errorBodySchema,
    },
  },
  generateReport: {
    method: 'POST',
    path: '/emit/report',
    summary: 'Generate a structured report from a query.',
    body: emitReportBodySchema,
    responses: {
      200: emitDocumentResponseSchema,
      400: errorBodySchema,
    },
  },
  generateSummary: {
    method: 'POST',
    path: '/emit/summary',
    summary: 'Generate a summary digest over a date range.',
    body: emitSummaryBodySchema,
    responses: {
      200: emitDocumentResponseSchema,
      400: errorBodySchema,
    },
  },
  generateTimeline: {
    method: 'POST',
    path: '/emit/timeline',
    summary: 'Generate a chronological timeline from dated engrams.',
    body: emitTimelineBodySchema,
    responses: {
      200: emitDocumentResponseSchema,
      400: errorBodySchema,
    },
  },
  preview: {
    method: 'POST',
    path: '/emit/preview',
    summary: 'Dry-run the pipeline: return sources + an outline without synthesis.',
    body: emitGenerateBodySchema,
    responses: {
      200: emitPreviewResponseSchema,
      400: errorBodySchema,
    },
  },
});

export type CerebrumEmitContract = typeof cerebrumEmitContract;
