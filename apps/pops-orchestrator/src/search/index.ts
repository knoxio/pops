/**
 * Orchestrator federated-search surface.
 *
 * `runSearch` is the route-facing entry point: parse the raw query, fan it out
 * over the federation source, and return the merged + ranked + decorated
 * sections. The federation source / engine internals are exported for tests
 * and for the route wiring in `app.ts`.
 */
import { searchAll, type SearchAllResult, type SearchSource } from './engine.js';
import { createFederationSource } from './federation.js';
import { parseQuery } from './query-parser.js';

import type { SearchContext } from './types.js';

export { searchAll, HITS_PER_SECTION } from './engine.js';
export type { PillarSearchGroup, SearchSource, SearchAllResult } from './engine.js';
export {
  createFederationSource,
  resolveSearchPillars,
  sdkSearchInvoker,
  SEARCH_PILLARS,
} from './federation.js';
export type {
  FederationSourceOptions,
  PillarSearchMeta,
  PillarSearchResponse,
  SearchInvoker,
} from './federation.js';
export { parseQuery } from './query-parser.js';
export type { ParsedQuery } from './query-parser.js';
export { getDomainApp, isContextDomain } from './domain-app-mapping.js';
export type {
  MatchType,
  ParsedFilter,
  Query,
  SearchContext,
  SearchHit,
  SearchSection,
} from './types.js';

const ROOT_CONTEXT: SearchContext = { app: null, page: null };

export interface RunSearchOptions {
  /** Raw user input. Parsed for structured filter tokens before fan-out. */
  readonly text: string;
  /** Where the search was invoked from. Defaults to the root context. */
  readonly context?: SearchContext;
  /**
   * Hit source. Defaults to the production federation source. Injectable so
   * the route handler and tests can supply a stub.
   */
  readonly source?: SearchSource;
}

/**
 * Parse, federate, and rank a search query. Returns empty sections for a
 * blank query without touching any pillar.
 */
export async function runSearch(options: RunSearchOptions): Promise<SearchAllResult> {
  const parsed = parseQuery(options.text);
  if (parsed.text.length === 0 && (parsed.filters === undefined || parsed.filters.length === 0)) {
    return { sections: [] };
  }

  const source = options.source ?? createFederationSource();
  const context = options.context ?? ROOT_CONTEXT;
  return searchAll({ text: parsed.text }, context, { source });
}
