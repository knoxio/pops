/**
 * Types for the Cerebrum Document Generation system (PRD-083).
 *
 * Covers: GenerationRequest, GeneratedDocument, GenerationMode,
 * and the preview/generation pipeline interfaces.
 */

import type { SourceCitation } from '../query/types.js';

/** Supported document generation modes. */
export type GenerationMode = 'report' | 'summary' | 'timeline';

/** Supported output formats. */
export type OutputFormat = 'markdown' | 'plain';

/** Date range filter with ISO 8601 strings. */
export interface DateRange {
  from: string;
  to: string;
}

/** Optional grouping strategies for timelines. */
export type TimelineGroupBy = 'type' | 'month' | 'quarter';

/**
 * Generation request — the input to the document generation pipeline.
 * Corresponds to the PRD-083 GenerationRequest data model.
 */
export interface GenerationRequest {
  /** Output mode: report, summary, or timeline. */
  mode: GenerationMode;
  /** Topic or question — required for report mode. */
  query?: string;
  /** Date range filter — required for summary mode. */
  dateRange?: DateRange;
  /** Explicit scope filter for retrieval. */
  scopes?: string[];
  /** Intended audience scope (e.g., 'work.*'). Controls content inclusion. */
  audienceScope?: string;
  /** Opt-in for *.secret.* content (default: false). */
  includeSecret?: boolean;
  /** Filter engrams by type (e.g., 'decision', 'meeting'). */
  types?: string[];
  /** Filter engrams by tags. */
  tags?: string[];
  /** Output format (default: 'markdown'). */
  format?: OutputFormat;
  /** Grouping strategy for timeline mode. */
  groupBy?: TimelineGroupBy;
}

/** Metadata about the generation process. */
export interface GenerationMetadata {
  sourceCount: number;
  dateRange: DateRange | null;
  scopeCoverage: string[];
  mode: GenerationMode;
  truncated: boolean;
}

/**
 * Generated document — the output of the document generation pipeline.
 * Corresponds to the PRD-083 GeneratedDocument data model.
 */
export interface GeneratedDocument {
  title: string;
  body: string;
  mode: GenerationMode;
  sources: SourceCitation[];
  audienceScope: string;
  dateRange: DateRange | null;
  metadata: GenerationMetadata;
}

/** Result of a generate call — document or notice on insufficient data. */
export interface GenerationResult {
  document: GeneratedDocument | null;
  notice?: string;
}

/** Result of a preview call — sources and outline without full generation. */
export interface PreviewResult {
  sources: SourceCitation[];
  outline: string;
}

/** Type importance ranking for summary highlights (higher = more important). */
export const TYPE_IMPORTANCE: Record<string, number> = {
  decision: 7,
  research: 6,
  meeting: 5,
  idea: 4,
  journal: 3,
  note: 2,
  capture: 1,
};
