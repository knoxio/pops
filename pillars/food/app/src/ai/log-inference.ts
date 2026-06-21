/**
 * PRD-133 — `callClaudeWithLogging` wrapper.
 *
 * Funnels every food handler's Claude call through one place that
 * measures latency, computes cost, evaluates the per-call cost cap,
 * and routes a row to the (injectable) log sink. Logging is
 * fire-and-forget — the wrapper returns immediately after `opts.call()`
 * resolves; a slow or failing sink can never delay or fail an ingest.
 *
 * Types live in `log-inference-types.ts`; the default env-driven sink
 * lives in `log-inference-sink.ts` and is re-exported here so the
 * documented entrypoint stays `@pops/app-food/src/ai/log-inference`.
 */
import { logFoodInference } from './log-inference-sink.js';

import type {
  CallClaudeWithLoggingDeps,
  CallClaudeWithLoggingOpts,
  ClaudeCallResult,
  ClaudeUsage,
  LogFoodInferenceFn,
  LogFoodInferenceInput,
  PricingEntry,
} from './log-inference-types.js';

export type {
  CallClaudeWithLoggingDeps,
  CallClaudeWithLoggingOpts,
  ClaudeCallResult,
  ClaudeUsage,
  FoodOperation,
  LogFoodInferenceFn,
  LogFoodInferenceInput,
  LookupPricingFn,
  PricingEntry,
} from './log-inference-types.js';

export { logFoodInference };

const DEFAULT_FOOD_INGEST_COST_CAP_USD = 0.05;

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
