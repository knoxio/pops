/**
 * Thin re-export of the `@pops/core-db` pricing cache, bound to the
 * shared drizzle handle. The cache + DB SELECT logic lives in
 * `@pops/core-db`'s `ai-model-pricing` service per the Theme 13
 * hot-path migration audit (row 5).
 *
 * The handle is the shared `pops.db` for now because the underlying
 * `ai_model_pricing` table cutover into `core.db` is sequenced behind
 * PRD-186 PR 4. After that lands the only line that changes is
 * `getDrizzle()` -> `getCoreDrizzle()`.
 */
import { aiModelPricingService, type PricingCache } from '@pops/core-db';

import { getDrizzle } from '../db.js';

let cache: PricingCache | null = null;

function getCache(): PricingCache {
  cache ??= aiModelPricingService.createPricingCache(getDrizzle());
  return cache;
}

export function lookupPricing(provider: string, model: string): { input: number; output: number } {
  return getCache().lookup(provider, model);
}
