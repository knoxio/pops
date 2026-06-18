/**
 * Orchestrator search types.
 *
 * The cross-package contract (`Query`, `SearchContext`, `SearchHit`,
 * `MatchType`) is re-exported from `@pops/types` so the wire shape the
 * orchestrator merges is byte-identical to what each pillar's `/search`
 * endpoint returns. `ParsedFilter` is the orchestrator-local query-parser
 * filter shape (`key/value`) — distinct from the cross-package
 * `StructuredFilter` (`field/operator/value`); see `query-parser.ts`.
 */
import type { MatchType, Query, SearchContext, SearchHit } from '@pops/types';

export type { MatchType, Query, SearchContext, SearchHit };

/**
 * Filter shape produced by the orchestrator-local query parser. Distinct from
 * the cross-package `StructuredFilter` (`field/operator/value`) — the parser
 * collapses operator into the value to keep the parsed token a flat
 * `(key, value)` pair.
 */
export interface ParsedFilter {
  key: string;
  value: string;
}

/**
 * One pillar's decorated contribution to the federated result. Mirrors the
 * monolith engine's `SearchSection` shape so the frontend's section renderer
 * stays drop-in compatible after the core.search repoint (follow-up
 * increment). One section per pillar: a pillar's `/search` returns a single
 * flat `hits` list (finance aggregates its three adapters into one), so the
 * federator decorates at pillar granularity.
 */
export interface SearchSection {
  /** Pillar-level domain identifier used by the frontend section header. */
  domain: string;
  /** Owning pillar id. Used by the frontend to filter absent-pillar sections. */
  moduleId: string;
  /** Lucide icon name for the section header. */
  icon: string;
  /** App color token for section theming. */
  color: string;
  /** True when this pillar's domain belongs to the current app context. */
  isContextSection: boolean;
  /** Ranked hits, capped to {@link import('./engine.js').HITS_PER_SECTION}. */
  hits: SearchHit[];
  /** Full pre-cap hit count for the pillar. */
  totalCount: number;
}

export interface SearchAllResult {
  sections: SearchSection[];
}
