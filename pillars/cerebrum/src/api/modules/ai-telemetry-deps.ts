/**
 * Shared `@pops/ai-telemetry` dependency wiring for cerebrum's Claude callers.
 *
 * Every cerebrum LLM port routes through `callWithLogging` /
 * `callWithLoggingStream`, reporting usage/cost/latency to the ai pillar's
 * `POST /ai-usage/record`. The deps are built once per process: an
 * `httpLookupPricing` adapter pointed at the ai pillar, wrapped in a
 * per-(provider, model) memo so repeated inferences do not re-hit
 * `GET /ai-pricing` on every call, and the default env-driven report sink
 * (`createEnvReportSink` reads `AI_API_URL` first). Reporting is
 * fire-and-forget — a slow or absent sink never alters a caller's behaviour.
 */
import {
  type CallWithLoggingDeps,
  httpLookupPricing,
  type LookupPricingFn,
  type PricingEntry,
} from '@pops/ai-telemetry';

export const CEREBRUM_DOMAIN = 'cerebrum';
export const ANTHROPIC_PROVIDER = 'anthropic';

const DEFAULT_AI_API_URL = 'http://ai-api:3008';

function resolveAiApiUrl(): string {
  return process.env['AI_API_URL'] ?? DEFAULT_AI_API_URL;
}

/**
 * Wraps a {@link LookupPricingFn} with a per-(provider, model) cache. Pricing
 * is effectively static for a process lifetime, so a single HTTP read per pair
 * is enough; a `null` miss is cached too so an unpriced model never re-hits the
 * ai pillar on every inference.
 */
function memoizePricing(lookup: LookupPricingFn): LookupPricingFn {
  const cache = new Map<string, Promise<PricingEntry | null>>();
  return (provider, model) => {
    const key = `${provider} ${model}`;
    let entry = cache.get(key);
    if (entry === undefined) {
      entry = lookup(provider, model);
      cache.set(key, entry);
    }
    return entry;
  };
}

let cached: CallWithLoggingDeps | undefined;
let override: CallWithLoggingDeps | undefined;

/**
 * Process-cached telemetry deps for cerebrum callers. The `report` field is
 * left unset so `callWithLogging` falls back to the env-driven sink, which
 * no-ops under vitest/dev when `AI_API_URL`/`POPS_API_INTERNAL_TOKEN` are unset.
 */
export function cerebrumTelemetryDeps(): CallWithLoggingDeps {
  if (override) return override;
  cached ??= { lookupPricing: memoizePricing(httpLookupPricing(resolveAiApiUrl())) };
  return cached;
}

/** Test seam: inject fake `report`/`lookupPricing`; pass null to restore. */
export function __setCerebrumTelemetryDepsForTests(deps: CallWithLoggingDeps | null): void {
  override = deps ?? undefined;
}
