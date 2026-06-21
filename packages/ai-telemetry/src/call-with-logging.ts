import { buildBaseRecord, errorMessageOf, makeFire, noopWarn } from './internal.js';
import { createEnvReportSink } from './report-sink.js';

import type { CallWithLoggingDeps, CallWithLoggingOpts, PricingEntry } from './types.js';

/**
 * Computes the USD cost of a call from per-million-token pricing. Returns
 * `missing: true` (and `costUsd: 0`) when pricing is unknown so the caller can
 * distinguish "free" from "unpriced".
 */
export function computeCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: PricingEntry | null
): { costUsd: number; missing: boolean } {
  if (!pricing) return { costUsd: 0, missing: true };
  const costUsd =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  return { costUsd, missing: false };
}

/**
 * Wraps a non-streaming Claude call: returns the response on the hot path
 * unchanged, then — fire-and-forget, off the hot path — looks up pricing,
 * computes cost, and reports the inference record. On throw it reports a
 * `status: 'error'` record (tokens 0) BEFORE rethrowing. Reporting failures are
 * swallowed via `deps.warn`; telemetry never alters control flow.
 */
export async function callWithLogging<T>(
  opts: CallWithLoggingOpts<T>,
  deps: CallWithLoggingDeps
): Promise<T> {
  const warn = deps.warn ?? noopWarn;
  const fire = makeFire(deps.report ?? createEnvReportSink(), warn);
  const base = buildBaseRecord(opts);
  const start = Date.now();

  try {
    const { response, usage } = await opts.call();
    const latencyMs = Date.now() - start;
    void (async (): Promise<void> => {
      const pricing = await deps.lookupPricing(opts.provider, opts.model).catch(() => null);
      const { costUsd } = computeCostUsd(usage.inputTokens, usage.outputTokens, pricing);
      fire({
        ...base,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd,
        latencyMs,
        status: 'success',
        cached: false,
      });
    })().catch((error: unknown) => warn('ai-telemetry: cost/report failed', error));
    return response;
  } catch (error) {
    const latencyMs = Date.now() - start;
    fire({
      ...base,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs,
      status: 'error',
      cached: false,
      errorMessage: errorMessageOf(error),
    });
    throw error;
  }
}
