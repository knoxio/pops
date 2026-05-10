/**
 * Token extractors for AI inference responses.
 *
 * The middleware (`inference-middleware.ts`) uses these helpers to derive
 * `input_tokens` / `output_tokens` from raw provider responses. Each
 * extractor inspects the result for a known shape and returns `null` when
 * the shape doesn't match so callers can fall through to the next one.
 *
 * Anthropic responses include `usage.input_tokens` / `usage.output_tokens`.
 * Ollama responses include `prompt_eval_count` / `eval_count`; older
 * versions or streaming endpoints omit those, so we estimate from the
 * `prompt` / `response` text using the same `word_count * 1.3` heuristic
 * Cerebrum uses for context assembly.
 */

interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function numberAt(record: Record<string, unknown>, key: string): number | null {
  const v = record[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function stringAt(record: Record<string, unknown>, key: string): string | null {
  const v = record[key];
  return typeof v === 'string' ? v : null;
}

/**
 * Estimate tokens from text using the `word_count * 1.3` approximation used
 * across POPS. Returns 0 for empty input.
 */
export function estimateTokens(text: string | null): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

function extractAnthropicTokens(result: Record<string, unknown>): TokenCounts | null {
  const usage = asRecord(result['usage']);
  if (!usage) return null;
  const input = numberAt(usage, 'input_tokens');
  const output = numberAt(usage, 'output_tokens');
  if (input === null && output === null) return null;
  return { inputTokens: input ?? 0, outputTokens: output ?? 0 };
}

function extractOllamaTokens(result: Record<string, unknown>): TokenCounts | null {
  const promptCount = numberAt(result, 'prompt_eval_count');
  const evalCount = numberAt(result, 'eval_count');
  if (promptCount !== null || evalCount !== null) {
    return { inputTokens: promptCount ?? 0, outputTokens: evalCount ?? 0 };
  }
  const promptText = stringAt(result, 'prompt');
  const responseText = stringAt(result, 'response');
  if (promptText === null && responseText === null) return null;
  return {
    inputTokens: estimateTokens(promptText),
    outputTokens: estimateTokens(responseText),
  };
}

/**
 * Extract token counts from an arbitrary AI inference result. Tries
 * Anthropic shape first, then Ollama (with word-count fallback). Returns
 * zero counts when nothing matches.
 */
export function extractTokens(result: unknown): TokenCounts {
  const record = asRecord(result);
  if (!record) return { inputTokens: 0, outputTokens: 0 };
  return (
    extractAnthropicTokens(record) ??
    extractOllamaTokens(record) ?? { inputTokens: 0, outputTokens: 0 }
  );
}
