/**
 * Report generation mode (PRD-083 US-01).
 *
 * Pipeline: retrieve relevant engrams -> group by subtopic -> synthesise
 * sections -> format with citations. Requires a query and minimum 2 sources.
 */

import { collectScopeCoverage, extractDateRange, extractTitle } from '../helpers.js';

import type { SourceCitation } from '../../query/types.js';
import type { RetrievalResult } from '../../retrieval/types.js';
import type { GeneratedDocument, GenerationResult } from '../types.js';

const MIN_SOURCES_FOR_REPORT = 2;

/**
 * Check if enough sources exist for a meaningful report.
 * Returns an insufficient-data notice if fewer than 2 sources.
 */
export function checkReportSources(results: RetrievalResult[]): GenerationResult | null {
  if (results.length === 0) {
    return {
      document: null,
      notice: 'No relevant engrams found for this query',
    };
  }

  if (results.length < MIN_SOURCES_FOR_REPORT) {
    return {
      document: null,
      notice: 'Insufficient data to generate a meaningful report',
    };
  }

  return null;
}

/**
 * Build the final report document from LLM output and source data.
 */
export function buildReportDocument(
  llmOutput: string,
  sources: SourceCitation[],
  audienceScope: string,
  results: RetrievalResult[]
): GeneratedDocument {
  const title = extractTitle(llmOutput, 'Generated Report');
  const dateRange = extractDateRange(results);
  const scopeCoverage = collectScopeCoverage(results);

  return {
    title,
    body: llmOutput,
    mode: 'report',
    sources,
    audienceScope,
    dateRange,
    metadata: {
      sourceCount: sources.length,
      dateRange,
      scopeCoverage,
      mode: 'report',
      truncated: false,
    },
  };
}
