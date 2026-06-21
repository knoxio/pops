/**
 * Handler for `GET /ai-pricing/:provider/:model`.
 *
 * Returns the per-Mtok USD `{ input, output }` pair from the process-local
 * {@link createPricingCache} (which falls back to a default price on miss, so
 * the route never 404s). Public-readable so the cross-pillar telemetry wrapper's
 * `httpLookupPricing` can fetch pricing already shaped as a `PricingEntry`.
 *
 * The cache is created once per handler factory call and reused across requests
 * (its own TTL bounds staleness against dashboard pricing edits).
 */
import { aiModelPricingService, type AiDb } from '../../db/index.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { aiPricingContract } from '../../contract/rest-pricing.js';

type Req = ServerInferRequest<typeof aiPricingContract>;

export function makePricingHandler(db: AiDb) {
  const cache = aiModelPricingService.createPricingCache(db);
  return {
    lookup: ({ params }: Req['lookup']) =>
      runHttp(() => {
        const price = cache.lookup(params.provider, params.model);
        return { status: 200 as const, body: { input: price.input, output: price.output } };
      }),
  };
}
