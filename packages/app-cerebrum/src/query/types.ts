// Re-declared on the frontend (rather than imported from the API source
// tree) because PRD-097 package boundaries forbid that import.

export const QUERY_DOMAINS = ['engrams', 'transactions', 'media', 'inventory'] as const;
export type QueryDomain = (typeof QUERY_DOMAINS)[number];

export const QUERY_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type QueryConfidence = (typeof QUERY_CONFIDENCE_LEVELS)[number];

export interface QuerySourceCitation {
  id: string;
  type: string;
  title: string;
  excerpt: string;
  relevance: number;
  scope: string;
}

export interface QueryAnswer {
  answer: string;
  sources: QuerySourceCitation[];
  scopes: string[];
  confidence: QueryConfidence;
}

// Form holds `scopes` as a raw string so the input stays controlled
// without round-tripping through array<->csv on every keystroke.
export interface QueryFormState {
  question: string;
  scopes: string;
  domains: QueryDomain[];
  includeSecret: boolean;
}

export const DEFAULT_QUERY_FORM: QueryFormState = {
  question: '',
  scopes: '',
  domains: [],
  includeSecret: false,
};

// Persisted in localStorage so re-runs survive a reload; captures the
// full filter set required to replay the query exactly.
export interface QueryHistoryEntry {
  id: string;
  submittedAt: string;
  question: string;
  scopes: string[];
  domains: QueryDomain[];
  includeSecret: boolean;
  lastConfidence: QueryConfidence | null;
  lastSourceCount: number;
}
