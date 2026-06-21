/**
 * `ai-pricing.*` sub-router — cross-pillar pricing read.
 *
 * `GET /ai-pricing/:provider/:model` returns the per-million-token USD pair
 * `{ input, output }` already shaped as the `@pops/ai-telemetry` `PricingEntry`,
 * so cross-pillar callers do NOT re-derive it from `inputCostPerMtok` /
 * `outputCostPerMtok`. Public-readable (NOT internal) — the telemetry wrapper's
 * `httpLookupPricing` fetches it before `computeCostUsd`. Backed by the moved
 * `createPricingCache(db).lookup()`, which falls back to a default price on miss.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

const PricingParams = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

const PricingEntrySchema = z.object({
  input: z.number(),
  output: z.number(),
});

export const aiPricingContract = c.router({
  lookup: {
    method: 'GET',
    path: '/ai-pricing/:provider/:model',
    pathParams: PricingParams,
    responses: { 200: PricingEntrySchema },
    summary: 'Resolve per-Mtok USD pricing { input, output } for a provider/model',
  },
});
