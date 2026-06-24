/**
 * Types for the cerebrum query engine.
 */

export type QueryDomain = 'engrams' | 'transactions' | 'media' | 'inventory';

/** Supported query domains mapped to retrieval sourceType values. */
export const DOMAIN_SOURCE_TYPE_MAP: Record<QueryDomain, string> = {
  engrams: 'engram',
  transactions: 'transaction',
  media: 'media',
  inventory: 'inventory',
};

export const ALL_QUERY_DOMAINS: QueryDomain[] = ['engrams', 'transactions', 'media', 'inventory'];

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface QueryRequest {
  question: string;
  scopes?: string[];
  includeSecret?: boolean;
  /** Maximum number of sources to retrieve (default 10). */
  maxSources?: number;
  /** Filter by domain. Omit or empty to search all. */
  domains?: QueryDomain[];
}

export interface QueryResponse {
  answer: string;
  sources: SourceCitation[];
  /** Scopes used for retrieval (explicit or inferred). */
  scopes: string[];
  confidence: ConfidenceLevel;
}

export interface SourceCitation {
  id: string;
  type: string;
  title: string;
  /** Truncated at a word boundary with ellipsis. */
  excerpt: string;
  /** Relevance score, normalized between zero and one. */
  relevance: number;
  /** Primary scope of the source. */
  scope: string;
}

export type ScopeInferenceSource = 'explicit' | 'inferred' | 'default';

export interface ScopeInferenceResult {
  scopes: string[];
  source: ScopeInferenceSource;
}

/** Internal result from the citation parser. */
export interface CitationParseResult {
  cleanedAnswer: string;
  citations: SourceCitation[];
}
