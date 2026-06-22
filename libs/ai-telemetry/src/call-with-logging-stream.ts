import { computeCostUsd } from './call-with-logging.js';
import { buildBaseRecord, errorMessageOf, makeFire, noopWarn } from './internal.js';
import { createEnvReportSink } from './report-sink.js';

import type { CallWithLoggingDeps, CallWithLoggingStreamOpts } from './types.js';

/**
 * Wraps a Claude stream generator: re-yields every event verbatim with zero
 * added latency, tracking only the last event. After the stream drains it
 * extracts usage (`extractUsage(last)`), looks up pricing, and reports a
 * `status: 'success'` record — all off the hot path. If the underlying
 * generator throws, it reports `status: 'error'` (tokens 0) BEFORE rethrowing.
 * It never buffers the stream and never delays a yield.
 */
export async function* callWithLoggingStream<E>(
  opts: CallWithLoggingStreamOpts<E>,
  deps: CallWithLoggingDeps
): AsyncGenerator<E> {
  const warn = deps.warn ?? noopWarn;
  const fire = makeFire(deps.report ?? createEnvReportSink(), warn);
  const base = buildBaseRecord(opts);
  const start = Date.now();
  let last: E | undefined;

  try {
    for await (const event of opts.stream()) {
      last = event;
      yield event;
    }
  } catch (error) {
    fire({
      ...base,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: Date.now() - start,
      status: 'error',
      cached: false,
      errorMessage: errorMessageOf(error),
    });
    throw error;
  }

  const latencyMs = Date.now() - start;
  const usage = opts.extractUsage(last);
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  void (async (): Promise<void> => {
    const pricing = usage
      ? await deps.lookupPricing(opts.provider, opts.model).catch(() => null)
      : null;
    const { costUsd } = computeCostUsd(inputTokens, outputTokens, pricing);
    fire({
      ...base,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      status: 'success',
      cached: false,
    });
  })().catch((error: unknown) => warn('ai-telemetry: cost/report failed', error));
}
