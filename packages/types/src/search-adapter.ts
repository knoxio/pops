/**
 * Search adapter descriptor — per-module declaration of how the unified search
 * engine queries a domain (PRD-101 US-06).
 *
 * Mirrors today's `SearchAdapter` interface from
 * `apps/pops-api/src/modules/core/search/types.ts` so the migration to a
 * registry-based engine in US-06 is a wiring change, not a contract change.
 *
 * The frontend `SearchAdapter` (in `./search.ts`) extends this with a render
 * component; the descriptor here is backend-only and stays out of React's
 * reach so `@pops/types` doesn't need to depend on it.
 */
import type { Query, SearchContext, SearchHit } from './search.js';

export interface SearchAdapterDescriptor<TData = unknown> {
  /** Domain identifier matching the owning module's id, e.g. `finance`, `media`. */
  domain: string;
  /** Lucide icon name for the section header in the unified search UI. */
  icon: string;
  /** App color token for section theming in the unified search UI. */
  color: string;
  /**
   * Search the domain and return ranked hits. Sync or async — the engine
   * awaits either way. Implementations MUST honour `options.limit` when set.
   */
  search(
    query: Query,
    context: SearchContext,
    options?: { limit?: number }
  ): SearchHit<TData>[] | Promise<SearchHit<TData>[]>;
}
