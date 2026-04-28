import { getSettingValue } from '../../core/settings/service.js';

/**
 * ContextAssemblyService — assembles a token-budgeted context window from
 * retrieval results, formatted for LLM consumption with source attribution.
 *
 * Token counting: word_count * 1.3 approximation (no tokeniser dependency).
 * Truncation: at a sentence boundary (regex /[.!?]\s/) or hard at budget.
 */
import type { RetrievalResult, SourceAttribution } from './types.js';

function getContextTokenBudget(): number {
  return getSettingValue('cerebrum.context.tokenBudget', 4096);
}
const WORDS_TO_TOKENS = 1.3;
const SENTENCE_BOUNDARY = /[.!?]\s/;

function estimateTokens(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * WORDS_TO_TOKENS);
}

function truncateToTokenBudget(text: string, budget: number): { text: string; truncated: boolean } {
  if (budget <= 0) return { text: '[truncated]', truncated: true };
  const estimated = estimateTokens(text);
  if (estimated <= budget) return { text, truncated: false };

  // Approximate character count that fits.
  const targetWords = Math.max(0, Math.floor(budget / WORDS_TO_TOKENS));
  if (targetWords === 0) return { text: '[truncated]', truncated: true };

  const words = text.split(/\s+/);
  const sliced = words.slice(0, targetWords).join(' ');

  // Try to find a sentence boundary within the last 20% of sliced text.
  const lookback = Math.floor(sliced.length * 0.2);
  const searchRegion = sliced.slice(sliced.length - lookback);
  const match = searchRegion.search(SENTENCE_BOUNDARY);

  if (match !== -1) {
    const cutPos = sliced.length - lookback + match + 1;
    return { text: sliced.slice(0, cutPos).trimEnd() + ' [truncated]', truncated: true };
  }

  return { text: sliced.trimEnd() + ' [truncated]', truncated: true };
}

function formatSection(result: RetrievalResult, includeMetadata: boolean): string {
  const header = `[${result.sourceType}:${result.sourceId}] ${result.title}`;

  let meta = '';
  if (includeMetadata) {
    const parts: string[] = [];
    if (result.metadata['type']) parts.push(`type: ${result.metadata['type']}`);
    const scopes = result.metadata['scopes'] as string[] | undefined;
    if (scopes?.length) parts.push(`scopes: ${scopes.join(', ')}`);
    const tags = result.metadata['tags'] as string[] | undefined;
    if (tags?.length) parts.push(`tags: ${tags.join(', ')}`);
    if (result.metadata['createdAt']) parts.push(`date: ${result.metadata['createdAt']}`);
    if (parts.length) meta = `(${parts.join(' | ')})`;
  }

  const body = result.contentPreview || '(no preview)';
  const headerLine = meta ? `${header} ${meta}` : header;

  return `---\n${headerLine}\n${body}`;
}

export interface ContextAssemblyInput {
  query: string;
  results: RetrievalResult[];
  tokenBudget?: number;
  includeMetadata?: boolean;
}

export interface ContextAssemblyOutput {
  context: string;
  sources: SourceAttribution[];
  truncated: boolean;
  tokenEstimate: number;
}

export class ContextAssemblyService {
  assemble(input: ContextAssemblyInput): ContextAssemblyOutput {
    const { query, results, tokenBudget = getContextTokenBudget(), includeMetadata = true } = input;

    const seen = new Set<string>();
    const sections: string[] = [];
    const sources: SourceAttribution[] = [];
    let anyTruncated = false;

    // Preamble — clamp remaining to 0 if preamble alone exceeds the budget.
    const preamble = `Query: ${query}\n`;
    const preambleTokens = estimateTokens(preamble);
    let remaining = Math.max(0, tokenBudget - preambleTokens);

    for (const result of results) {
      // Dedup by content hash when available, otherwise by source identity.
      const hashKey = (result.metadata['contentHash'] as string | undefined) ?? '';
      const dedupeKey = hashKey || `${result.sourceType}:${result.sourceId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      if (remaining <= 0) break;

      const section = formatSection(result, includeMetadata);
      const { text: fitted, truncated } = truncateToTokenBudget(section, remaining);
      const usedTokens = estimateTokens(fitted);

      sections.push(fitted);
      sources.push({
        sourceType: result.sourceType,
        sourceId: result.sourceId,
        title: result.title,
        relevanceScore: result.score,
      });

      remaining = Math.max(0, remaining - usedTokens);
      if (truncated) {
        anyTruncated = true;
        break;
      }
    }

    const context = sections.length > 0 ? `${preamble}\n${sections.join('\n')}` : preamble;
    const tokenEstimate = tokenBudget - remaining;

    return { context, sources, truncated: anyTruncated, tokenEstimate };
  }
}
