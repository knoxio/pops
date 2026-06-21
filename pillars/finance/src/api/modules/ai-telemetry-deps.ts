/**
 * Shared `@pops/ai-telemetry` dependency wiring for finance's Claude callers.
 *
 * Every finance call site routes through `callWithLogging`, reporting
 * usage/cost/latency to the ai pillar's `POST /ai-usage/record`. The deps are
 * built once per process: a single `httpLookupPricing` adapter pointed at the
 * ai pillar (its `fetch` is memoised internally) and the default env-driven
 * report sink (`createEnvReportSink` reads `AI_API_URL` first). Reporting is
 * fire-and-forget — a slow or absent sink never alters the caller's behaviour.
 */
import { type CallWithLoggingDeps, httpLookupPricing } from '@pops/ai-telemetry';

export const FINANCE_DOMAIN = 'finance';
export const ANTHROPIC_PROVIDER = 'anthropic';

const DEFAULT_AI_API_URL = 'http://ai-api:3008';

function resolveAiApiUrl(): string {
  return process.env['AI_API_URL'] ?? DEFAULT_AI_API_URL;
}

let cached: CallWithLoggingDeps | undefined;
let override: CallWithLoggingDeps | undefined;

/**
 * Process-cached telemetry deps for finance callers. The `report` field is left
 * unset so `callWithLogging` falls back to the env-driven sink, which no-ops
 * under vitest/dev when `AI_API_URL`/`POPS_API_INTERNAL_TOKEN` are unset.
 */
export function financeTelemetryDeps(): CallWithLoggingDeps {
  if (override) return override;
  cached ??= { lookupPricing: httpLookupPricing(resolveAiApiUrl()) };
  return cached;
}

/** Test seam: inject fake `report`/`lookupPricing`; pass null to restore. */
export function __setFinanceTelemetryDepsForTests(deps: CallWithLoggingDeps | null): void {
  override = deps ?? undefined;
}
