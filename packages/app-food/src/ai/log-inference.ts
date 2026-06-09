/**
 * PRD-133 — AI usage logging helpers for the food ingestion pipeline.
 *
 * Exports the types + the `callClaudeWithLogging` wrapper that every
 * food handler in PRDs 127-132 funnels through, plus the canonical
 * `logFoodInference` sink (POSTs to the `food.ai.logInference` tRPC
 * mutation when `POPS_API_URL` + `POPS_API_INTERNAL_TOKEN` are set;
 * no-ops otherwise). The sink is injectable so tests pass a fake and
 * the wrapper stays isomorphic.
 *
 * Behaviour:
 *
 *   1. Records start time, awaits `opts.call()`.
 *   2. On success: looks up pricing via `deps.lookupPricing`, computes
 *      `costUsd`, evaluates the cost cap, then schedules a log row
 *      with `status: 'success'`. Missing pricing → cost = 0 +
 *      `metadata.cost_missing = true`. costUsd above the cap →
 *      `metadata.over_cost_cap = true` + console warn (v1 does NOT
 *      abort the call).
 *   3. On error: schedules a log row with `status: 'error' +
 *      errorMessage`, then rethrows.
 *   4. Logging is fire-and-forget — the caller never awaits the sink,
 *      so a slow / failing sink can never delay or fail an ingest.
 *      Tests flush the microtask queue before asserting log state.
 */

const DEFAULT_FOOD_INGEST_COST_CAP_USD = 0.05;

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
  /**
   * Per-call cost cap in USD. When the computed costUsd exceeds it the
   * wrapper flags `metadata.over_cost_cap = true` and warns. Defaults
   * to `FOOD_INGEST_COST_CAP_PER_JOB_USD` env var (when present) or
   * 0.05 USD per PRD-126's compose default.
   */
  costCapUsd?: number;
}

export interface CallClaudeWithLoggingDeps {
  /** Defaults to `logFoodInference` (env-driven POST to the mutation). */
  log?: LogFoodInferenceFn;
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

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const env = process.env;
  if (!env) return undefined;
  const value = env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resolveCostCap(opt: number | undefined): number {
  if (typeof opt === 'number' && Number.isFinite(opt) && opt > 0) return opt;
  const envValue = readEnv('FOOD_INGEST_COST_CAP_PER_JOB_USD');
  if (envValue !== undefined) {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_FOOD_INGEST_COST_CAP_USD;
}

function defaultWarn(message: string, err: unknown): void {
  console.warn(message, err);
}

/**
 * Default sink: POSTs the row to `food.ai.logInference` when
 * `POPS_API_URL` + `POPS_API_INTERNAL_TOKEN` are configured (worker /
 * sibling-process env). No-ops in browser / dev / tests where the
 * env is unset — the caller can still inject `deps.log` to override.
 */
export const logFoodInference: LogFoodInferenceFn = async (input) => {
  const apiUrl = readEnv('POPS_API_URL');
  const token = readEnv('POPS_API_INTERNAL_TOKEN');
  if (!apiUrl || !token) return;
  if (typeof globalThis.fetch !== 'function') return;

  const url = `${apiUrl.replace(/\/+$/, '')}/trpc/food.ai.logInference`;
  const res = await globalThis.fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pops-internal-token': token,
    },
    body: JSON.stringify({ json: input }),
  });
  if (!res.ok) {
    throw new Error(`food.ai.logInference returned HTTP ${res.status}`);
  }
};

/**
 * Schedule a log write as a detached promise. The caller never awaits
 * this — that's the whole point of fire-and-forget. Errors from the
 * sink land on `warn` so they show up in operator logs without
 * affecting the caller's control flow.
 */
function scheduleLog(
  log: LogFoodInferenceFn,
  warn: (message: string, err: unknown) => void,
  input: LogFoodInferenceInput
): void {
  Promise.resolve()
    .then(() => log(input))
    .catch((err: unknown) => warn('[food/ai] logFoodInference failed; continuing', err));
}

function buildErrorRow<T>(
  opts: CallClaudeWithLoggingOpts<T>,
  err: unknown,
  latencyMs: number
): LogFoodInferenceInput {
  const errorMessage = err instanceof Error ? err.message : String(err);
  return {
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
    metadata: { ...opts.metadata, prompt_version: opts.promptVersion },
  };
}

interface SuccessFlags {
  costUsd: number;
  costMissing: boolean;
  usageMissing: boolean;
  overCostCap: boolean;
}

function buildSuccessRow<T>(
  opts: CallClaudeWithLoggingOpts<T>,
  usage: ClaudeUsage,
  flags: SuccessFlags,
  latencyMs: number
): LogFoodInferenceInput {
  const metadata: Record<string, unknown> = {
    ...opts.metadata,
    prompt_version: opts.promptVersion,
  };
  if (flags.costMissing) metadata['cost_missing'] = true;
  if (flags.usageMissing) metadata['usage_missing'] = true;
  if (flags.overCostCap) metadata['over_cost_cap'] = true;
  return {
    operation: opts.operation,
    contextId: opts.contextId,
    provider: 'claude',
    model: opts.model,
    promptVersion: opts.promptVersion,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: flags.costUsd,
    latencyMs,
    status: 'success',
    cached: false,
    metadata,
  };
}

export async function callClaudeWithLogging<T>(
  opts: CallClaudeWithLoggingOpts<T>,
  deps: CallClaudeWithLoggingDeps
): Promise<T> {
  const warn = deps.warn ?? defaultWarn;
  const log = deps.log ?? logFoodInference;
  const costCap = resolveCostCap(opts.costCapUsd);
  const start = Date.now();

  let result: ClaudeCallResult<T>;
  try {
    result = await opts.call();
  } catch (err) {
    scheduleLog(log, warn, buildErrorRow(opts, err, Date.now() - start));
    throw err;
  }

  const latencyMs = Date.now() - start;
  const { inputTokens, outputTokens } = result.usage;
  const usageMissing = inputTokens === 0 && outputTokens === 0;

  const pricing = await deps.lookupPricing('claude', opts.model);
  const { costUsd, missing: costMissing } = computeCostUsd(inputTokens, outputTokens, pricing);
  const overCostCap = !costMissing && costUsd > costCap;
  if (overCostCap) {
    warn(
      `[food/ai] ${opts.operation} cost $${costUsd.toFixed(6)} exceeds cap $${costCap.toFixed(6)} (over_cost_cap=true logged; call not aborted in v1)`,
      undefined
    );
  }

  scheduleLog(
    log,
    warn,
    buildSuccessRow(
      opts,
      result.usage,
      { costUsd, costMissing, usageMissing, overCostCap },
      latencyMs
    )
  );

  return result.response;
}
