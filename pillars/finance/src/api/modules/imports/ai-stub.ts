/**
 * AI categorizer seam — STUBBED for the F1 slice.
 *
 * The monolith routes unmatched transactions to Claude Haiku to suggest an
 * entity + tags. That wiring (Anthropic SDK, disk cache, retry/inference
 * middleware, API-key resolution) is deliberately NOT ported here: F2 owns it.
 *
 * This stub preserves the exact return contract the pipeline expects —
 * `{ result: AiCacheEntry | null; usage?: AiUsageStats }` — and is gated behind
 * `FINANCE_AI_CATEGORIZER_ENABLED`. With the categorizer disabled (the F1
 * default) every call returns `{ result: null }`: no entity is suggested, no
 * usage is recorded, and the pipeline falls through to the no-match path.
 *
 * F2 replaces the body of {@link categorizeWithAi} with the real Anthropic
 * call; the call sites and the counters plumbing in `process-transaction.ts`
 * stay untouched.
 */

/** Cached/derived AI categorization for one transaction description. */
export interface AiCacheEntry {
  entityName: string;
  /** Preferred multi-tag result. */
  tags?: string[];
  /** Legacy single-category fallback (validated against the known-tags vocabulary). */
  category?: string | null;
}

/** Per-call token/cost accounting surfaced to the batch counters. */
export interface AiCallUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiCallResult {
  result: AiCacheEntry | null;
  usage?: AiCallUsage;
}

/** True only when the categorizer is explicitly enabled via env. Default: disabled. */
export function isAiCategorizerEnabled(): boolean {
  return process.env.FINANCE_AI_CATEGORIZER_ENABLED === 'true';
}

/**
 * Categorize an unknown transaction description.
 *
 * F1: always resolves to `{ result: null }` (categorizer disabled). The
 * arguments are kept on the signature so the F2 wiring is a body-only change.
 */
export async function categorizeWithAi(
  _rawRow: string,
  _importBatchId?: string,
  _knownTags: string[] = []
): Promise<AiCallResult> {
  if (!isAiCategorizerEnabled()) return { result: null };

  // F2: wire the real Anthropic categorizer here. Until then, an "enabled"
  // flag with no implementation behaves identically to disabled.
  return { result: null };
}
