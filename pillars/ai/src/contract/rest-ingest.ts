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
    // 403: the internal-token gate (api/app.ts) rejects callers without a
    // matching `x-pops-internal-token` before the handler runs. Declared so the
    // OpenAPI projection is truthful for cross-pillar callers.
    responses: {
      200: z.object({ ok: z.literal(true) }),
      400: ErrorBodySchema,
      403: z.object({ message: z.string() }),
    },
    summary: 'Record one AI inference (internal; cross-pillar telemetry sink)',
  },
});
