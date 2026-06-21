/**
 * PRD-128 — local shim for PRD-133's `callClaudeWithLogging`.
 *
 * PRD-133 lives in `pillars/food/app/src/ai/log-inference.ts` which
 * has a React dependency tree the worker doesn't want to pull in. This
 * shim records the same telemetry shape and emits a pino line; the
 * post-merge follow-up (recorded in the roadmap claim) extracts the
 * canonical wrapper into a worker-friendly package and swaps this for
 * a one-line import.
 *
 * Operation strings mirror PRD-133's `FoodOperationSchema` literals so
 * the swap-in is a no-op at the call site.
 */
import pino from 'pino';

const logger = pino({ name: 'pops-worker-food.web-llm' });

export type WebLlmOperation = 'recipe-extract-web-llm';

export interface CallClaudeArgs<T> {
  operation: WebLlmOperation;
  contextId: string;
  promptVersion: string;
  model: string;
  call: () => Promise<{
    parsed: T;
    inputTokens: number;
    outputTokens: number;
    raw: string;
  }>;
  /** Test seam — receives the log payload that would be persisted. */
  onLog?: (payload: CallClaudeLogPayload) => void;
}

export interface CallClaudeLogPayload {
  operation: WebLlmOperation;
  contextId: string;
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  ok: boolean;
  errorMessage?: string;
}

export interface CallClaudeResult<T> {
  parsed: T;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  raw: string;
}

const HAIKU_INPUT_USD_PER_MTOK = 0.25;
const HAIKU_OUTPUT_USD_PER_MTOK = 1.25;

function computeCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * HAIKU_INPUT_USD_PER_MTOK + outputTokens * HAIKU_OUTPUT_USD_PER_MTOK) / 1_000_000
  );
}

/**
 * Wraps the inner Claude call so the caller doesn't worry about
 * timings, cost, or log payload shape. Errors propagate; the log line
 * captures them as `ok=false` before re-throwing.
 */
export async function callClaudeWithLogging<T>(
  args: CallClaudeArgs<T>
): Promise<CallClaudeResult<T>> {
  const startedAt = Date.now();
  try {
    const inner = await args.call();
    const latencyMs = Date.now() - startedAt;
    const costUsd = computeCostUsd(inner.inputTokens, inner.outputTokens);
    const payload: CallClaudeLogPayload = {
      operation: args.operation,
      contextId: args.contextId,
      promptVersion: args.promptVersion,
      model: args.model,
      inputTokens: inner.inputTokens,
      outputTokens: inner.outputTokens,
      costUsd,
      latencyMs,
      ok: true,
    };
    emit(payload, args.onLog);
    return {
      parsed: inner.parsed,
      inputTokens: inner.inputTokens,
      outputTokens: inner.outputTokens,
      costUsd,
      latencyMs,
      raw: inner.raw,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    emit(
      {
        operation: args.operation,
        contextId: args.contextId,
        promptVersion: args.promptVersion,
        model: args.model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        ok: false,
        errorMessage: message,
      },
      args.onLog
    );
    throw err;
  }
}

function emit(payload: CallClaudeLogPayload, sink?: (p: CallClaudeLogPayload) => void): void {
  if (sink != null) {
    try {
      sink(payload);
    } catch {
      // Logging must never break the call site.
    }
    return;
  }
  logger.info(payload, 'claude-call');
}
