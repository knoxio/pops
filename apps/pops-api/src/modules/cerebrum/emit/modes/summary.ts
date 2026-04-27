/**
 * Summary generation mode (PRD-083 US-02).
 *
 * Retrieves engrams within a date range, groups by type/topic,
 * and produces a digestible overview (weekly digest, monthly review).
 */

import {
  collectScopeCoverage,
  extractDateRange,
  extractTitle,
  toSourceCitations,
} from '../helpers.js';
import { TYPE_IMPORTANCE } from '../types.js';

import type { SourceCitation } from '../../query/types.js';
import type { RetrievalResult } from '../../retrieval/types.js';
import type { DateRange, GeneratedDocument } from '../types.js';

/** Maximum number of sources for a single summary to avoid context overflow. */
const MAX_SUMMARY_SOURCES = 50;

/**
 * Build an empty summary document for date ranges with zero engrams.
 */
export function buildEmptySummary(dateRange: DateRange, audienceScope: string): GeneratedDocument {
  return {
    title: `Summary: ${dateRange.from} to ${dateRange.to}`,
    body: `# Summary: ${dateRange.from} to ${dateRange.to}\n\nNo engrams found between ${dateRange.from} and ${dateRange.to}.`,
    mode: 'summary',
    sources: [],
    audienceScope,
    dateRange,
    metadata: {
      sourceCount: 0,
      dateRange,
      scopeCoverage: [],
      mode: 'summary',
      truncated: false,
    },
  };
}

/**
 * Cap results at MAX_SUMMARY_SOURCES, sorted by relevance.
 * Returns the capped list and whether truncation occurred.
 */
export function capSummaryResults(results: RetrievalResult[]): {
  capped: RetrievalResult[];
  truncated: boolean;
} {
  if (results.length <= MAX_SUMMARY_SOURCES) {
    return { capped: results, truncated: false };
  }
  const sorted = [...results].toSorted((a, b) => b.score - a.score);
  return { capped: sorted.slice(0, MAX_SUMMARY_SOURCES), truncated: true };
}

/**
 * Sort sources by type importance for highlights extraction.
 * Returns sources ordered by TYPE_IMPORTANCE descending.
 */
export function sortByTypeImportance(sources: SourceCitation[]): SourceCitation[] {
  return [...sources].toSorted((a, b) => {
    const aImportance = TYPE_IMPORTANCE[a.type] ?? 0;
    const bImportance = TYPE_IMPORTANCE[b.type] ?? 0;
    return bImportance - aImportance;
  });
}

/** Parameters for building a summary document. */
interface BuildSummaryParams {
  llmOutput: string;
  results: RetrievalResult[];
  dateRange: DateRange;
  audienceScope: string;
  truncated: boolean;
}

/**
 * Build the final summary document from LLM output and source data.
 */
export function buildSummaryDocument(params: BuildSummaryParams): GeneratedDocument {
  const { llmOutput, results, dateRange, audienceScope, truncated } = params;
  const sources = toSourceCitations(results);
  const actualDateRange = extractDateRange(results) ?? dateRange;
  const scopeCoverage = collectScopeCoverage(results);
  const title = extractTitle(llmOutput, `Summary: ${dateRange.from} to ${dateRange.to}`);

  return {
    title,
    body: llmOutput,
    mode: 'summary',
    sources,
    audienceScope,
    dateRange: actualDateRange,
    metadata: {
      sourceCount: sources.length,
      dateRange: actualDateRange,
      scopeCoverage,
      mode: 'summary',
      truncated,
    },
  };
}
