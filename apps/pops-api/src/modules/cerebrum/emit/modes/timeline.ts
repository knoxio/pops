/**
 * Timeline generation mode (PRD-083 US-03).
 *
 * Retrieves dated engrams, produces chronological sequences.
 * Each entry: date, title, type badge, one-line summary.
 */

import {
  collectScopeCoverage,
  extractDateRange,
  extractTitle,
  toSourceCitations,
} from '../helpers.js';

import type { RetrievalResult } from '../../retrieval/types.js';
import type { GeneratedDocument } from '../types.js';

/**
 * Sort retrieval results chronologically by createdAt date (oldest first).
 */
export function sortChronologically(results: RetrievalResult[]): RetrievalResult[] {
  return [...results].toSorted((a, b) => {
    const dateA = (a.metadata['createdAt'] as string | undefined) ?? '';
    const dateB = (b.metadata['createdAt'] as string | undefined) ?? '';
    return dateA.localeCompare(dateB);
  });
}

/**
 * Build a single-entry timeline notice.
 */
export function buildSingleEntryNotice(): string {
  return '\n\n*This timeline represents a single point in time.*';
}

/**
 * Build the final timeline document from LLM output and source data.
 */
export function buildTimelineDocument(
  llmOutput: string,
  results: RetrievalResult[],
  audienceScope: string
): GeneratedDocument {
  const sources = toSourceCitations(results);
  const dateRange = extractDateRange(results);
  const scopeCoverage = collectScopeCoverage(results);
  const title = extractTitle(llmOutput, 'Timeline');

  // Add single-entry notice if applicable.
  const body = results.length === 1 ? llmOutput + buildSingleEntryNotice() : llmOutput;

  return {
    title,
    body,
    mode: 'timeline',
    sources,
    audienceScope,
    dateRange,
    metadata: {
      sourceCount: sources.length,
      dateRange,
      scopeCoverage,
      mode: 'timeline',
      truncated: false,
    },
  };
}
