/**
 * Thin re-export of the `@pops/core-db` pricing cache, bound to the
 * core pillar drizzle handle. The cache + DB SELECT logic lives in
 * `@pops/core-db`'s `ai-model-pricing` service per the Theme 13
 * hot-path migration audit (row 5).
 *
 * Reads resolve against `getCoreDrizzle()` now that PRD-186 PR 4 cut
 * the `ai_model_pricing` table over into `core.db`. The shared
 * `pops.db` copy still exists for fallback.
 */
import { aiModelPricingService, type PricingCache } from '@pops/core-db';

import { getCoreDrizzle } from '../db.js';

let cache: PricingCache | null = null;

function getCache(): PricingCache {
  cache ??= aiModelPricingService.createPricingCache(getCoreDrizzle());
  return cache;
}

export function lookupPricing(provider: string, model: string): { input: number; output: number } {
  return getCache().lookup(provider, model);
}
