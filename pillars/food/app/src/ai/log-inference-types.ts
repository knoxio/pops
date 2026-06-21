/**
 * PRD-133 — shared types for `log-inference.ts` and its sink.
 *
 * Kept separate so the wrapper and the default sink can both depend
 * on these without creating a circular import.
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
