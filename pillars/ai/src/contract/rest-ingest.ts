/**
 * `ai-ingest.*` sub-router — the canonical cross-pillar telemetry sink.
 *
 * `POST /ai-usage/record` is internal-only (gated by `x-pops-internal-token`
 * in `api/app.ts`'s {@link INTERNAL_PATHS}; nginx never proxies it). It is the
 * FIRST production write path into `ai_inference_log`: every pillar that calls
 * Claude routes its usage/cost/latency through the `@pops/ai-telemetry` wrapper,
 * which POSTs one {@link InferenceRecordSchema} row here.
 *
 * The body is the SINGLE SOURCE OF TRUTH `InferenceRecordSchema` from
 * `@pops/ai-telemetry/record-schema` so the wrapper and the ingest can never
 * drift. The handler does ONLY `createInferenceLog` (best-effort, always 200) —
 * it never touches `ai_inference_daily` (that is a batch aggregator owned by the
 * observability scheduler).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { InferenceRecordSchema } from '@pops/ai-telemetry/record-schema';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

export const aiIngestContract = c.router({
  record: {
    method: 'POST',
    path: '/ai-usage/record',
    body: InferenceRecordSchema,
    responses: { 200: z.object({ ok: z.literal(true) }), 400: ErrorBodySchema },
    summary: 'Record one AI inference (internal; cross-pillar telemetry sink)',
  },
});
