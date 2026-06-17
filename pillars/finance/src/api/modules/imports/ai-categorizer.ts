/**
 * AI categorizer seam — routes an unmatched transaction description to
 * Claude to suggest a merchant entity + tags. Reached only after the
 * deterministic ladder (corrections → transfer → entity match) misses.
 *
 * Differences from the monolith categorizer (deliberate for the pillar):
 *   - config from env, not core-settings (`FINANCE_AI_CATEGORIZER_MODEL`,
 *     `FINANCE_AI_CATEGORIZER_MAX_TOKENS`, `ANTHROPIC_API_KEY`/`CLAUDE_API_KEY`);
 *   - gated by `FINANCE_AI_CATEGORIZER_ENABLED` (disabled → no call, `{result:null}`);
 *   - no disk cache and no central usage-logging / budget enforcement.
 *
 * Only the merchant description is sent to the API — no account/card numbers
 * or personal identifiers.
 */
import Anthropic from '@anthropic-ai/sdk';

import { buildEntryFromText, callApiOrThrow } from './ai-categorizer-api.js';
import { AiCategorizationError } from './ai-categorizer-error.js';

/** Derived AI categorization for one transaction description. */
export interface AiCacheEntry {
  /** Sanitized merchant/brand name, or null when no real merchant is recoverable. */
  entityName: string | null;
  /** Preferred multi-tag result. */
  tags?: string[];
  /** Legacy single-category fallback. */
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

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 200;
// Claude Haiku pricing (USD per 1M tokens) for the cost estimate.
const INPUT_COST_PER_M = 1.0;
const OUTPUT_COST_PER_M = 5.0;

/** True only when the categorizer is explicitly enabled via env. Default: disabled. */
export function isAiCategorizerEnabled(): boolean {
  return process.env['FINANCE_AI_CATEGORIZER_ENABLED'] === 'true';
}

function getModel(): string {
  return process.env['FINANCE_AI_CATEGORIZER_MODEL'] ?? DEFAULT_MODEL;
}

function getMaxTokens(): number {
  const raw = process.env['FINANCE_AI_CATEGORIZER_MAX_TOKENS'];
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_TOKENS;
}

function getApiKey(): string {
  return process.env['ANTHROPIC_API_KEY'] ?? process.env['CLAUDE_API_KEY'] ?? '';
}

/**
 * Categorize an unknown transaction description. Resolves to `{result:null}`
 * when the categorizer is disabled or the model returns no usable text;
 * throws `AiCategorizationError` when enabled without a key or on an API
 * failure (the caller degrades that to an uncertain row).
 */
export async function categorizeWithAi(
  rawRow: string,
  _importBatchId?: string,
  knownTags: string[] = []
): Promise<AiCallResult> {
  if (!isAiCategorizerEnabled()) return { result: null };

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AiCategorizationError('ANTHROPIC_API_KEY not configured', 'NO_API_KEY');
  }

  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const response = await callApiOrThrow({
    client,
    rawRow,
    sanitizedDescription: rawRow.trim().slice(0, 100),
    model: getModel(),
    maxTokens: getMaxTokens(),
    knownTags,
  });

  if (!response.text) return { result: null };

  const entry = buildEntryFromText(response.text);
  const costUsd =
    (response.inputTokens / 1_000_000) * INPUT_COST_PER_M +
    (response.outputTokens / 1_000_000) * OUTPUT_COST_PER_M;
  return {
    result: entry,
    usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens, costUsd },
  };
}
