/**
 * `ai_model_pricing` lookup with a per-process in-memory cache.
 *
 * The inference middleware needs cheap, synchronous access to the
 * (input, output) cost-per-Mtok pair on every provider call. A bare
 * SELECT-all into a `Map` keyed by `${providerId}:${modelId}` is
 * sufficient — the table is small (one row per priced model) and the
 * cache TTL (default 5 minutes) bounds staleness when ops edit pricing
 * via the dashboard.
 *
 * Per `docs/themes/13-pillar-finale/notes/infra-hot-path-migration.md`
 * row 5 the `ai_model_pricing` table is owned by the core pillar (per
 * PRD-186). This module is the SDK surface for that ownership; the
 * physical table cutover from the shared `pops.db` into `core.db` lands
 * with the PRD-186 sibling PR.
 *
 * Cache invariants:
 *   - Each `(providerId, modelId)` key remembers the timestamp at which
 *     it was populated.
 *   - A cache hit on a non-expired key skips the DB entirely.
 *   - A miss (either no entry or an expired one) triggers a full
 *     SELECT-all refresh; the refresh re-stamps every populated key, so
 *     subsequent unrelated lookups within the TTL window remain hits.
 *   - On DB error the lookup returns the configured fallback price —
 *     pricing data is best-effort because the inference call itself is
 *     more important than precise cost attribution.
 */
import { aiModelPricing } from '../schema.js';

import type { CoreDb } from './internal.js';

/** Cost-per-million-tokens pair for a single (provider, model). */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
}

/** Public API of a pricing cache returned from {@link createPricingCache}. */
export interface PricingCache {
  /**
   * Resolve `(input, output)` cost-per-Mtok for the given provider + model pair.
   * Returns the configured fallback on cache miss + DB failure or on an unknown key.
   */
  lookup(provider: string, model: string): ModelPrice;
  /** Drop every cached entry; the next lookup forces a DB refresh. */
  clear(): void;
}

interface PricingEntry {
  inputCostPerMtok: number;
  outputCostPerMtok: number;
  cachedAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_FALLBACK: ModelPrice = { input: 1.0, output: 5.0 };

/**
 * Build a process-local pricing lookup bound to the given core DB
 * handle. Each call to `lookup(provider, model)` either hits the cache
 * or refreshes the entire pricing table from SQLite.
 *
 * @param db - Core drizzle handle. Captured by closure; the same handle
 *   is used for every refresh against this cache.
 * @param options.ttlMs - Cache freshness window in milliseconds.
 *   Defaults to 5 minutes.
 * @param options.fallback - Returned when the cache is empty AND a
 *   refresh fails OR the requested key is unknown. Defaults to
 *   `{ input: 1.0, output: 5.0 }` to preserve historical behaviour.
 * @param options.now - Optional clock override; tests use this to drive
 *   the TTL deterministically. Defaults to `Date.now`.
 */
export function createPricingCache(
  db: CoreDb,
  options: { ttlMs?: number; fallback?: ModelPrice; now?: () => number } = {}
): PricingCache {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const fallback = options.fallback ?? DEFAULT_FALLBACK;
  const now = options.now ?? Date.now;
  const cache = new Map<string, PricingEntry>();

  function refresh(timestamp: number): void {
    const rows = db
      .select({
        providerId: aiModelPricing.providerId,
        modelId: aiModelPricing.modelId,
        inputCostPerMtok: aiModelPricing.inputCostPerMtok,
        outputCostPerMtok: aiModelPricing.outputCostPerMtok,
      })
      .from(aiModelPricing)
      .all();
    for (const row of rows) {
      cache.set(`${row.providerId}:${row.modelId}`, {
        inputCostPerMtok: row.inputCostPerMtok,
        outputCostPerMtok: row.outputCostPerMtok,
        cachedAt: timestamp,
      });
    }
  }

  return {
    lookup(provider: string, model: string): ModelPrice {
      const key = `${provider}:${model}`;
      const cached = cache.get(key);
      const currentNow = now();
      if (cached && currentNow - cached.cachedAt < ttlMs) {
        return { input: cached.inputCostPerMtok, output: cached.outputCostPerMtok };
      }
      try {
        refresh(currentNow);
        const entry = cache.get(key);
        if (entry) return { input: entry.inputCostPerMtok, output: entry.outputCostPerMtok };
      } catch {
        // pricing lookup is best-effort
      }
      return fallback;
    },
    clear(): void {
      cache.clear();
    },
  };
}
