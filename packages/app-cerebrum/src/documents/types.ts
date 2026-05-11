/**
 * Public types for the Documents surface (PRD-083).
 *
 * Mirror of the server-side `GenerationRequest` / `GeneratedDocument`
 * shapes. The frontend package may not import from the API source per
 * PRD-097 boundaries.
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
