import type { InferenceRecord } from './record-schema.js';

export type { InferenceRecord } from './record-schema.js';

/** Fire-and-forget sink for a finished inference record. Must never throw. */
export type ReportInferenceFn = (record: InferenceRecord) => Promise<void>;

/** Per-million-token USD pricing for a given provider/model. */
export interface PricingEntry {
  input: number;
  output: number;
}

/** Resolves pricing for a provider/model, or null when unknown. */
export type LookupPricingFn = (provider: string, model: string) => Promise<PricingEntry | null>;

/** What a wrapped non-streaming Claude call must hand back. */
export interface CallResult<T> {
  response: T;
  usage: { inputTokens: number; outputTokens: number };
}

/** Dependencies shared by both the request and streaming entrypoints. */
export interface CallWithLoggingDeps {
  /** Defaults to the env-driven {@link ReportInferenceFn} from `report-sink`. */
  report?: ReportInferenceFn;
  lookupPricing: LookupPricingFn;
  /** Diagnostic channel for swallowed telemetry failures. */
  warn?: (message: string, error: unknown) => void;
}

/** Identity + provenance carried onto every emitted {@link InferenceRecord}. */
export interface InferenceContext {
  provider: string;
  model: string;
  operation: string;
  domain: string;
  contextId?: string;
  promptVersion?: string;
  metadata?: Record<string, unknown>;
  /**
   * Reserved for the future `GET /ai-budgets/check` pre-call gate (Open
   * Decision 2 ratified telemetry-only for v1). Carried through but not
   * enforced — present so callers can wire budgets without an interface break.
   */
  costCapUsd?: number;
}

export interface CallWithLoggingOpts<T> extends InferenceContext {
  call: () => Promise<CallResult<T>>;
}

export interface CallWithLoggingStreamOpts<E> extends InferenceContext {
  /** The underlying Claude stream generator. */
  stream: () => AsyncGenerator<E>;
  /**
   * Extracts token usage from the last observed event. Returns null when usage
   * is unavailable (e.g. the stream errored before the terminal event).
   */
  extractUsage: (lastEvent: E | undefined) => { inputTokens: number; outputTokens: number } | null;
}
