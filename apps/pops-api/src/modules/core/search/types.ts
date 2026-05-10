/**
 * Backend search types — re-export the cross-package contract from
 * `@pops/types` (the descriptor in `search-adapter.ts` is the canonical
 * source) plus the api-local query parser filter shape.
 *
 * `SearchAdapter<T>` is an alias for `SearchAdapterDescriptor<T>` so each
 * module's `manifest.search` slot accepts the same value the runtime engine
 * dispatches against. Aligning the types removes the structural mismatch
 * between the @pops/types `StructuredFilter` (`field/operator/value`) and the
 * api-local query parser shape below (`key/value`) by giving each its own
 * named type.
 */
import type {
  Query as TypesQuery,
  SearchContext as TypesSearchContext,
  SearchHit as TypesSearchHit,
  SearchAdapterDescriptor,
} from '@pops/types';

export type Query = TypesQuery;
export type SearchContext = TypesSearchContext;
export type SearchHit<T = unknown> = TypesSearchHit<T>;
export type SearchAdapter<T = unknown> = SearchAdapterDescriptor<T>;

/**
 * Filter shape produced by the api-local query parser. Distinct from the
 * cross-package `StructuredFilter` (`field/operator/value`) — the parser
 * collapses operator into the value to keep the parsed token a flat
 * `(key, value)` pair.
 */
export interface ParsedFilter {
  key: string;
  value: string;
}
