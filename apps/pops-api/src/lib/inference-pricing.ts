import { aiModelPricing } from '@pops/db-types';

import { getDrizzle } from '../db.js';

interface PricingEntry {
  inputCostPerMtok: number;
  outputCostPerMtok: number;
  cachedAt: number;
}

const pricingCache = new Map<string, PricingEntry>();
const PRICING_TTL_MS = 5 * 60 * 1000;

function refreshPricingCache(now: number): void {
  const rows = getDrizzle()
    .select({
      providerId: aiModelPricing.providerId,
      modelId: aiModelPricing.modelId,
      inputCostPerMtok: aiModelPricing.inputCostPerMtok,
      outputCostPerMtok: aiModelPricing.outputCostPerMtok,
    })
    .from(aiModelPricing)
    .all();
  for (const row of rows) {
    pricingCache.set(`${row.providerId}:${row.modelId}`, {
      inputCostPerMtok: row.inputCostPerMtok,
      outputCostPerMtok: row.outputCostPerMtok,
      cachedAt: now,
    });
  }
}

export function lookupPricing(provider: string, model: string): { input: number; output: number } {
  const key = `${provider}:${model}`;
  const cached = pricingCache.get(key);
  if (cached && Date.now() - cached.cachedAt < PRICING_TTL_MS) {
    return { input: cached.inputCostPerMtok, output: cached.outputCostPerMtok };
  }
  try {
    refreshPricingCache(Date.now());
    const entry = pricingCache.get(key);
    if (entry) return { input: entry.inputCostPerMtok, output: entry.outputCostPerMtok };
  } catch {
    // pricing lookup is best-effort
  }
  return { input: 1.0, output: 5.0 };
}
