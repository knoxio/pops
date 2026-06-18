/**
 * Federated search engine — the monolith fan-out engine
 * (`apps/pops-api/src/modules/core/search/engine.ts`) with a PLUGGABLE hit
 * source.
 *
 * The monolith engine owned both the fan-out (calling each in-process
 * `adapter.search()`) AND the merge/rank/section-ordering. In the orchestrator
 * the fan-out moves over the network: each pillar's `/search` endpoint returns
 * an already-ranked flat hit list, and the federation source
 * (`federation.ts`) is responsible for issuing those HTTP calls and decorating
 * each pillar's hits with `domain`/`icon`/`color`/`isContextSection`.
 *
 * This module keeps the PURE half: given the source's per-pillar result
 * groups, it sorts hits within each group, caps them per section, drops empty
 * groups, and orders context sections (current app) first then by top score.
 * The `source` option is the analogue of the monolith engine's `adapters?`
 * override seam — production callers pass {@link federationSource}; tests pass
 * a stub that returns fixed groups with no network.
 */
import { z } from 'zod';

import { isContextDomain } from './domain-app-mapping.js';

import type { Query, SearchContext, SearchHit, SearchSection } from './types.js';

/**
 * One pillar's raw (pre-sort, pre-cap) contribution to the fan-out, carrying
 * the decoration metadata the source resolved for it. The engine erases the
 * fan-out detail: it only consumes these groups.
 */
export interface PillarSearchGroup {
  /** Section domain (pillar-level). Drives context-section detection. */
  domain: string;
  /** Owning pillar id. */
  moduleId: string;
  icon: string;
  color: string;
  /** Ranked-or-unranked hits as returned by the pillar; the engine re-sorts. */
  hits: SearchHit[];
}

/**
 * Pluggable hit source. Resolves every search-capable pillar's group for the
 * query — best-effort: a down pillar is omitted, never throws. Production:
 * {@link import('./federation.js').federationSource}. Tests: a stub.
 */
export type SearchSource = (query: Query, context: SearchContext) => Promise<PillarSearchGroup[]>;

export interface SearchAllResult {
  sections: SearchSection[];
}

export const SearchHitSchema = z.object({
  uri: z.string(),
  score: z.number(),
  matchField: z.string(),
  matchType: z.enum(['exact', 'prefix', 'contains']),
  data: z.unknown(),
});

export const SearchSectionSchema = z.object({
  domain: z.string(),
  moduleId: z.string(),
  icon: z.string(),
  color: z.string(),
  isContextSection: z.boolean(),
  hits: z.array(SearchHitSchema),
  totalCount: z.number(),
});

export const SearchAllResultSchema = z.object({
  sections: z.array(SearchSectionSchema),
});

export const HITS_PER_SECTION = 5;

export interface SearchAllOptions {
  /**
   * Hit source override. Production callers pass the federation source; tests
   * pass a stub. Required here (unlike the monolith's optional `adapters`)
   * because the orchestrator has no in-process default adapter registry — the
   * route handler injects {@link import('./federation.js').federationSource}.
   */
  source: SearchSource;
}

/**
 * Fan a query out to every search-capable pillar via the injected source,
 * then merge + rank + order the decorated per-pillar groups into sections.
 */
export async function searchAll(
  query: Query,
  context: SearchContext,
  options: SearchAllOptions
): Promise<SearchAllResult> {
  const currentApp = context.app;
  const groups = await options.source(query, context);

  const sections: SearchSection[] = [];

  for (const group of groups) {
    if (group.hits.length === 0) continue;

    const sorted = [...group.hits].toSorted((a, b) => b.score - a.score);

    sections.push({
      domain: group.domain,
      moduleId: group.moduleId,
      icon: group.icon,
      color: group.color,
      isContextSection: currentApp ? isContextDomain(group.domain, currentApp) : false,
      hits: sorted.slice(0, HITS_PER_SECTION),
      totalCount: sorted.length,
    });
  }

  sections.sort((a, b) => {
    if (a.isContextSection !== b.isContextSection) {
      return a.isContextSection ? -1 : 1;
    }
    const aTopScore = a.hits[0]?.score ?? 0;
    const bTopScore = b.hits[0]?.score ?? 0;
    return bTopScore - aTopScore;
  });

  return { sections };
}
