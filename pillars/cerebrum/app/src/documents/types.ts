/**
 * Public types for the Documents surface.
 *
 * Hand-mirrored from the emit module's `GeneratedDocument` /
 * `GenerationResult` shapes (pillars/cerebrum/src/api/modules/emit/types.ts);
 * the app builds independently and does not reach into the API module.
 */

export const GENERATION_MODES = ['report', 'summary', 'timeline'] as const;
export type GenerationMode = (typeof GENERATION_MODES)[number];

export interface DateRange {
  from: string;
  to: string;
}

export interface SourceCitation {
  id: string;
  type: string;
  title: string;
  excerpt: string;
  relevance: number;
  scope: string;
}

export interface GenerationMetadata {
  sourceCount: number;
  dateRange: DateRange | null;
  scopeCoverage: string[];
  mode: GenerationMode;
  truncated: boolean;
}

export interface GeneratedDocument {
  title: string;
  body: string;
  mode: GenerationMode;
  sources: SourceCitation[];
  audienceScope: string;
  dateRange: DateRange | null;
  metadata: GenerationMetadata;
}

export interface GenerationResult {
  document: GeneratedDocument | null;
  notice?: string;
}

export interface PreviewResult {
  sources: SourceCitation[];
  outline: string;
}

export interface DocumentsFormState {
  mode: GenerationMode;
  query: string;
  audienceScope: string;
  scopes: string;
  tags: string;
  dateFrom: string;
  dateTo: string;
  includeSecret: boolean;
}

export const DEFAULT_DOCUMENTS_FORM: DocumentsFormState = {
  mode: 'report',
  query: '',
  audienceScope: '',
  scopes: '',
  tags: '',
  dateFrom: '',
  dateTo: '',
  includeSecret: false,
};
