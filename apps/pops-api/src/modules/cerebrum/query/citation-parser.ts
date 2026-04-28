/**
 * CitationParser — extracts and validates inline source citations from LLM
 * output against the retrieved source set (PRD-082 US-03).
 *
 * Handles:
 *  - Bracketed engram IDs: [eng_20260417_0942_agent-coordination]
 *  - Bracketed sourceType:sourceId references: [engram:eng_20260417_0942_...]
 *  - Strips hallucinated citations (IDs not in retrieved set), logging them.
 *  - Truncates excerpts to 200 chars at word boundary with ellipsis.
 *  - Orders output citations by relevance (highest first).
 */
import { logger } from '../../../lib/logger.js';
import { getSettingValue } from '../../core/settings/service.js';

import type { RetrievalResult } from '../retrieval/types.js';
import type { CitationParseResult, SourceCitation } from './types.js';

/** Matches bracketed engram IDs like [eng_20260417_0942_agent-coordination]. */
const ENGRAM_CITATION_RE = /\[eng_\d{8}_\d{4}_[a-z0-9-]+\]/g;

/**
 * Matches bracketed sourceType:sourceId references like [engram:eng_...].
 * Captures sourceType and sourceId in groups.
 */
const TYPED_CITATION_RE = /\[(engram|transaction|media|inventory):([^\]]+)\]/g;

function getExcerptMaxLength(): number {
  return getSettingValue('cerebrum.citation.excerptMaxLength', 200);
}

/**
 * Truncate text to a maximum length at a word boundary, appending ellipsis.
 */
function truncateExcerpt(text: string): string {
  const maxLen = getExcerptMaxLength();
  if (text.length <= maxLen) return text;

  // Find last space within budget.
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > 0 ? lastSpace : maxLen;
  return text.slice(0, cutPoint) + '…';
}

/**
 * Determine the primary scope from RetrievalResult metadata.
 */
function extractPrimaryScope(result: RetrievalResult): string {
  const scopes = result.metadata['scopes'] as string[] | undefined;
  return scopes?.[0] ?? 'unknown';
}

/** Push a labelled metadata field into parts if the value is defined. */
function pushIfDefined(parts: string[], label: string, value: unknown): void {
  if (value !== undefined) parts.push(`${label}: ${String(value)}`);
}

/** Extract domain-specific metadata parts for enriching excerpts. */
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

/**
 * Format a domain-specific excerpt with additional metadata when available.
 */
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
    // Build lookup maps for fast matching.
    const bySourceId = new Map<string, RetrievalResult>();
    const byCompositeKey = new Map<string, RetrievalResult>();
    for (const r of retrievedSources) {
      bySourceId.set(r.sourceId, r);
      byCompositeKey.set(`${r.sourceType}:${r.sourceId}`, r);
    }

    const matchedIds = new Set<string>();
    let cleanedAnswer = llmOutput;

    // Extract bracketed engram IDs.
    for (const match of llmOutput.matchAll(ENGRAM_CITATION_RE)) {
      const id = match[0].slice(1, -1); // strip brackets
      if (bySourceId.has(id)) {
        matchedIds.add(id);
      } else {
        logger.warn({ citationId: id }, '[QueryEngine] Stripped hallucinated citation');
        cleanedAnswer = cleanedAnswer.replace(match[0], '');
      }
    }

    // Extract typed citations [sourceType:sourceId].
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
        logger.warn(
          { citationRef: fullMatch },
          '[QueryEngine] Stripped hallucinated typed citation'
        );
        cleanedAnswer = cleanedAnswer.replace(fullMatch, '');
      }
    }

    // Build citations from matched sources, ordered by relevance.
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

    // Clean up any double spaces left from stripping citations.
    cleanedAnswer = cleanedAnswer.replace(/  +/g, ' ').trim();

    return { cleanedAnswer, citations };
  }
}
