import pino from 'pino';

import type { AnthropicMessage } from './anthropic.js';

/**
 * Worker-local `callClaudeWithLogging`. Records timings and usage, fires
 * the log payload through `opts.onLog` (caller-injected so tests don't
 * need to mock the network), and returns the Anthropic response
 * unchanged. The PRD-133 canonical wrapper at
 * `packages/app-food/src/ai/log-inference.ts` is React-coupled (lives in
 * `@pops/app-food`); follow-up tracked in PRD-133 will extract it to a
 * backend-only package, at which point this module's `onLog` plugs into
 * the shared `LogFoodInferenceFn` instead of pino. Operation names here
 * already match PRD-133's `FoodOperationSchema` literals, so the swap is
 * mechanical.
 */

const logger = pino({ name: 'food-ai-log-inference', level: process.env['LOG_LEVEL'] ?? 'info' });

export interface InferenceLogInput {
  /** PRD-133 `operation` column — uniquely names the call site. */
  operation: string;
  /** Anthropic model id used. */
  model: string;
  /** Prompt template version (PRD-133 keys cost trends off this). */
  promptVersion: string;
  /** Stringly-namespaced FK to the originating row (`ingest_source:<id>`). */
  contextId: string;
  /** Provider-reported usage when available. */
  inputTokens?: number;
  outputTokens?: number;
  /** Computed once the pricing table lookup runs (PRD-133); null until then. */
  costUsd?: number;
  durationMs: number;
  /** `null` on success; error message on throw. */
  error?: string;
}

export interface CallClaudeWithLoggingOpts {
  operation: string;
  model: string;
  promptVersion: string;
  contextId: string;
  /** Returns the raw Anthropic message so usage stats survive. */
  call: () => Promise<AnthropicMessage>;
  /**
   * Side-channel for the log row. PRD-133's wrapper will inject a tRPC
   * mutation; the worker default just records to stdout so prod has
   * something to scrape until then. Errors swallowed — logging never
   * fails the ingest.
   */
  onLog?: (entry: InferenceLogInput) => void | Promise<void>;
}

export interface CallClaudeWithLoggingResult {
  message: AnthropicMessage;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

const defaultOnLog = (entry: InferenceLogInput): void => {
  logger.info({ inference: entry }, 'food.inference');
};

export async function callClaudeWithLogging(
  opts: CallClaudeWithLoggingOpts
): Promise<CallClaudeWithLoggingResult> {
  const start = Date.now();
  const onLog = opts.onLog ?? defaultOnLog;
  try {
    const message = await opts.call();
    const durationMs = Date.now() - start;
    const inputTokens = message.usage?.input_tokens ?? undefined;
    const outputTokens = message.usage?.output_tokens ?? undefined;
    void Promise.resolve(
      onLog({
        operation: opts.operation,
        model: opts.model,
        promptVersion: opts.promptVersion,
        contextId: opts.contextId,
        inputTokens,
        outputTokens,
        durationMs,
      })
    ).catch((err) => {
      logger.warn({ err: String(err) }, 'food.inference.log_failed');
    });
    return { message, durationMs, inputTokens, outputTokens };
  } catch (err) {
    const durationMs = Date.now() - start;
    void Promise.resolve(
      onLog({
        operation: opts.operation,
        model: opts.model,
        promptVersion: opts.promptVersion,
        contextId: opts.contextId,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      })
    ).catch((logErr) => {
      logger.warn({ err: String(logErr) }, 'food.inference.log_failed');
    });
    throw err;
  }
}
