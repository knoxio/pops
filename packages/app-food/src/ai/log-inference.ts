/**
 * PRD-133 — AI usage logging helpers for the food ingestion pipeline.
 *
 * Exports the types + the `callClaudeWithLogging` wrapper that every
 * food handler in PRDs 127-132 funnels through. The actual log sink is
 * passed in by the caller — the worker (PRD-126) will provide an impl
 * that POSTs to the `food.ai.logInference` tRPC mutation; tests provide
 * a fake. Keeping the sink injectable avoids dragging fetch/axios into
 * `@pops/app-food` and lets the wrapper stay isomorphic.
 *
 * Behaviour:
 *
 *   1. Records start time, awaits `opts.call()`.
 *   2. On success: looks up pricing via `opts.lookupPricing`, computes
 *      `costUsd`, calls `log({ ..., status: 'success' })`. Missing
 *      pricing → cost = 0 with `metadata.cost_missing = true`.
 *   3. On error: still calls `log({ ..., status: 'error', errorMessage })`,
 *      then rethrows.
 *   4. Logging is fire-and-forget — log failures are swallowed (a
 *      logging hiccup must never block a recipe ingest).
 */
export type FoodOperation =
  | 'recipe-extract-web-llm'
  | 'recipe-extract-ig-vision'
  | 'recipe-extract-ig-text-fallback'
  | 'recipe-extract-screenshot'
  | 'recipe-extract-text';

export interface LogFoodInferenceInput {
  operation: FoodOperation;
  contextId: string;
  provider: 'claude';
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: 'success' | 'error';
  cached: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export type LogFoodInferenceFn = (input: LogFoodInferenceInput) => Promise<void>;

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ClaudeCallResult<T> {
  response: T;
  usage: ClaudeUsage;
}

export interface PricingEntry {
  /** Cost per million input tokens, USD. */
  input: number;
  /** Cost per million output tokens, USD. */
  output: number;
}

export type LookupPricingFn = (
  provider: 'claude',
  model: string
) => Promise<PricingEntry | null> | (PricingEntry | null);

export interface CallClaudeWithLoggingOpts<T> {
  operation: FoodOperation;
  contextId: string;
  model: string;
  promptVersion: string;
  call: () => Promise<ClaudeCallResult<T>>;
  /** Additional fields merged into the logged `metadata` JSON. */
  metadata?: Record<string, unknown>;
}

export interface CallClaudeWithLoggingDeps {
  log: LogFoodInferenceFn;
  lookupPricing: LookupPricingFn;
  /**
   * Optional warn hook for log-sink errors. Defaults to `console.warn`.
   * Lets the worker route to its structured logger and lets tests
   * silence noise without monkey-patching `console`.
   */
  warn?: (message: string, err: unknown) => void;
}

/**
 * Computes `costUsd` from token counts. Returns `cost = 0` and
 * `missing = true` when no pricing entry is supplied — caller writes
 * that flag into `metadata.cost_missing`.
 */
export function computeCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: PricingEntry | null
): { costUsd: number; missing: boolean } {
  if (!pricing) return { costUsd: 0, missing: true };
  const costUsd =
    (inputTokens * pricing.input) / 1_000_000 + (outputTokens * pricing.output) / 1_000_000;
  return { costUsd, missing: false };
}

async function safeLog(
  log: LogFoodInferenceFn,
  warn: (message: string, err: unknown) => void,
  input: LogFoodInferenceInput
): Promise<void> {
  try {
    await log(input);
  } catch (err) {
    warn('[food/ai] logFoodInference failed; continuing', err);
  }
}

function defaultWarn(message: string, err: unknown): void {
  console.warn(message, err);
}

export async function callClaudeWithLogging<T>(
  opts: CallClaudeWithLoggingOpts<T>,
  deps: CallClaudeWithLoggingDeps
): Promise<T> {
  const warn = deps.warn ?? defaultWarn;
  const start = Date.now();

  let result: ClaudeCallResult<T>;
  try {
    result = await opts.call();
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : String(err);
    await safeLog(deps.log, warn, {
      operation: opts.operation,
      contextId: opts.contextId,
      provider: 'claude',
      model: opts.model,
      promptVersion: opts.promptVersion,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs,
      status: 'error',
      cached: false,
      errorMessage: errorMessage.slice(0, 1000),
      metadata: { prompt_version: opts.promptVersion, ...opts.metadata },
    });
    throw err;
  }

  const latencyMs = Date.now() - start;
  const { inputTokens, outputTokens } = result.usage;
  const usageMissing = inputTokens === 0 && outputTokens === 0;

  const pricing = await deps.lookupPricing('claude', opts.model);
  const { costUsd, missing: costMissing } = computeCostUsd(inputTokens, outputTokens, pricing);

  const metadata: Record<string, unknown> = {
    prompt_version: opts.promptVersion,
    ...opts.metadata,
  };
  if (costMissing) metadata['cost_missing'] = true;
  if (usageMissing) metadata['usage_missing'] = true;

  await safeLog(deps.log, warn, {
    operation: opts.operation,
    contextId: opts.contextId,
    provider: 'claude',
    model: opts.model,
    promptVersion: opts.promptVersion,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
    status: 'success',
    cached: false,
    metadata,
  });

  return result.response;
}

/**
 * Default no-op sink. Replaced by the worker (PRD-126) with a `fetch`
 * call to `food.ai.logInference`. Kept here so callers in tests that
 * don't care about the sink can construct an instance without wiring.
 */
export const noopLogFoodInference: LogFoodInferenceFn = async () => {};
