/**
 * CitationParser — extracts and validates inline source citations from LLM
 * output against the retrieved source set (lifted from the monolith query
 * module; ego is the only consumer in the pillar today).
 *
 * Handles bracketed engram IDs (`[eng_...]`) and typed references
 * (`[engram:eng_...]`), strips hallucinated citations not in the retrieved
 * set, truncates excerpts at a word boundary, and orders citations by
 * relevance.
 *
 * Pillar delta: the excerpt budget is a constant (no settings service) and a
 * stripped citation logs to `console.warn` rather than the shared logger.
 */
import type { RetrievalResult } from '../retrieval/types.js';

/** A resolved citation rendered alongside an ego chat response. */
export interface SourceCitation {
  id: string;
  type: string;
  title: string;
  /** Max EXCERPT_MAX_LENGTH chars, truncated at word boundary with ellipsis. */
  excerpt: string;
  /** Relevance score 0–1. */
  relevance: number;
  /** Primary scope of the source. */
  scope: string;
}

export interface CitationParseResult {
  cleanedAnswer: string;
  citations: SourceCitation[];
}

const ENGRAM_CITATION_RE = /\[eng_\d{8}_\d{4}_[a-z0-9-]+\]/g;
const TYPED_CITATION_RE = /\[(engram|transaction|media|inventory):([^\]]+)\]/g;
const EXCERPT_MAX_LENGTH = 200;

function truncateExcerpt(text: string): string {
  if (text.length <= EXCERPT_MAX_LENGTH) return text;
  const truncated = text.slice(0, EXCERPT_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > 0 ? lastSpace : EXCERPT_MAX_LENGTH;
  return text.slice(0, cutPoint) + '…';
}

function extractPrimaryScope(result: RetrievalResult): string {
  const scopes = result.metadata['scopes'] as string[] | undefined;
  return scopes?.[0] ?? 'unknown';
}

function pushIfDefined(parts: string[], label: string, value: unknown): void {
  if (value !== undefined) parts.push(`${label}: ${String(value)}`);
}

function extractDomainMetaParts(metadata: Record<string, unknown>, sourceType: string): string[] {
  const parts: string[] = [];
  switch (sourceType) {
    case 'transaction':
      pushIfDefined(parts, 'Amount', metadata['amount']);
      pushIfDefined(parts, 'Date', metadata['date'] ?? metadata['createdAt']);
      pushIfDefined(parts, 'Category', metadata['category']);
      break;
    case 'media':
      pushIfDefined(parts, 'Type', metadata['type'] ?? metadata['mediaType']);
      pushIfDefined(parts, 'Rating', metadata['rating']);
      break;
    case 'inventory':
      pushIfDefined(parts, 'Location', metadata['location']);
      break;
  }
  return parts;
}

function formatExcerpt(result: RetrievalResult): string {
  const parts = extractDomainMetaParts(result.metadata, result.sourceType);
  const metaPrefix = parts.length > 0 ? parts.join(' | ') + ' — ' : '';
  return truncateExcerpt(metaPrefix + (result.contentPreview ?? ''));
}

export class CitationParser {
  /**
   * Parse citations from LLM output, mapping them to retrieved sources.
   *
   * @param llmOutput        - Raw text from the LLM response.
   * @param retrievedSources - The source set from HybridSearchService.
   */
  parse(llmOutput: string, retrievedSources: RetrievalResult[]): CitationParseResult {
    const bySourceId = new Map<string, RetrievalResult>();
    const byCompositeKey = new Map<string, RetrievalResult>();
    for (const r of retrievedSources) {
      bySourceId.set(r.sourceId, r);
      byCompositeKey.set(`${r.sourceType}:${r.sourceId}`, r);
    }

    const matchedIds = new Set<string>();
    let cleanedAnswer = llmOutput;

    for (const match of llmOutput.matchAll(ENGRAM_CITATION_RE)) {
      const id = match[0].slice(1, -1);
      if (bySourceId.has(id)) {
        matchedIds.add(id);
      } else {
        console.warn(`[cerebrum-ego] Stripped hallucinated citation: ${id}`);
        cleanedAnswer = cleanedAnswer.replace(match[0], '');
      }
    }

    for (const match of llmOutput.matchAll(TYPED_CITATION_RE)) {
      const fullMatch = match[0];
      const sourceType = match[1];
      const sourceId = match[2];
      if (!sourceType || !sourceId) continue;
      const key = `${sourceType}:${sourceId}`;
      const result = byCompositeKey.get(key);
      if (result) {
        matchedIds.add(result.sourceId);
      } else if (bySourceId.has(sourceId)) {
        matchedIds.add(sourceId);
      } else {
        console.warn(`[cerebrum-ego] Stripped hallucinated typed citation: ${fullMatch}`);
        cleanedAnswer = cleanedAnswer.replace(fullMatch, '');
      }
    }

    const citations: SourceCitation[] = [];
    for (const id of matchedIds) {
      const result = bySourceId.get(id);
      if (!result) continue;
      citations.push({
        id: result.sourceId,
        type: result.sourceType,
        title: result.title,
        excerpt: formatExcerpt(result),
        relevance: result.score,
        scope: extractPrimaryScope(result),
      });
    }

    citations.sort((a, b) => b.relevance - a.relevance);
    cleanedAnswer = cleanedAnswer.replace(/  +/g, ' ').trim();

    return { cleanedAnswer, citations };
  }
}
