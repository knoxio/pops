/**
 * Search adapter and query types for the POPS search engine.
 *
 * These types define the cross-domain search contract: each domain implements
 * SearchAdapter<T> to expose its data to the unified search engine.
 *
 * @see PRD-057 Search Engine
 * @see PRD-058 Contextual Intelligence
 */

/** A structured filter for advanced query syntax (v2). */
export interface StructuredFilter {
  field: string;
  operator: string;
  value: string;
}

/** A user search query. */
export interface Query {
  /** Raw user input text. */
  text: string;
  /** Optional structured filters for advanced query syntax (v2). */
  filters?: StructuredFilter[];
}

/**
 * Context about where search is being invoked from.
 * Sourced from PRD-058 Contextual Intelligence.
 */
export interface SearchContext {
  /** Current app: "media", "finance", "inventory", "ai", or null at root. */
  app: string | null;
  /** Current page: "library", "transactions", "item-detail", etc. */
  page: string | null;
  /** Entity being viewed, if any. */
  entity?: {
    uri: string;
    type: string;
    title: string;
  };
  /** Active page filters. */
  filters?: Record<string, string>;
}

/** How a search hit was matched against the query. */
export type MatchType = 'exact' | 'prefix' | 'contains';

/** A single search result from a domain adapter. */
export interface SearchHit<T = unknown> {
  /** Unique resource identifier, e.g. "pops:media/movie/42". */
  uri: string;
  /** Relevance score: 0.0-1.0 (exact=1.0, prefix=0.8, contains=0.5). */
  score: number;
  /** Which field matched: "title", "description", "assetId", etc. */
  matchField: string;
  /** How the match was found. */
  matchType: MatchType;
  /** Domain-specific result data, opaque to the engine. */
  data: T;
}

/**
 * A domain-specific search adapter.
 *
 * Each domain implements this interface to participate in the unified search
 * engine. The engine erases T to unknown in its internal registry; type safety
 * is preserved within each domain.
 */
export interface SearchAdapter<T = unknown> {
  /** Domain identifier: "finance", "media", "inventory", etc. */
  domain: string;
  /** Lucide icon name for the section header. */
  icon: string;
  /** App color token for section theming. */
  color: string;
  /** Search the domain and return ranked hits. */
  search(
    query: Query,
    context: SearchContext,
    options?: { limit?: number }
  ): Promise<SearchHit<T>[]>;
  /**
   * Component for rendering a single search result.
   * Typed as a generic component function compatible with React function
   * components — accepts props containing the hit and raw query string.
   */
  ResultComponent: (props: { hit: SearchHit<T>; query: string }) => unknown;
}
