/**
 * Search fan-out engine — fans a query to all adapters declared in installed
 * module manifests via Promise.allSettled, groups results into sections, and
 * orders context sections (current app) first.
 *
 * PRD-101 US-06: adapters are sourced from `MODULES.flatMap(m => m.search ?? [])`
 * (joined to the live api-side manifests via `getOwnedAdapters()`), replacing
 * the deleted `searchAdapterRegistry` and per-module side-effect imports.
 */
import { z } from 'zod';

import { getOwnedAdapters, type OwnedAdapter } from '../../search-adapters.js';
import { isContextDomain } from './domain-app-mapping.js';

import type { Query, SearchContext, SearchHit } from './types.js';

export interface SearchSection {
  domain: string;
  /** Owning module id (matches a `MODULES[].id`). Used by the frontend to filter absent-module sections. */
  moduleId: string;
  icon: string;
  color: string;
  isContextSection: boolean;
  hits: SearchHit[];
  totalCount: number;
}

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

const HITS_PER_SECTION = 5;

export interface SearchAllOptions {
  /**
   * Test-only override for the adapter source. Production callers omit this
   * and the engine resolves adapters from the installed module manifests.
   */
  adapters?: readonly OwnedAdapter[];
}

export async function searchAll(
  query: Query,
  context: SearchContext,
  options: SearchAllOptions = {}
): Promise<SearchAllResult> {
  const adapters = options.adapters ?? getOwnedAdapters();
  const currentApp = context.app;

  const results = await Promise.allSettled(
    adapters.map(async ({ moduleId, adapter }) => {
      const hits = await adapter.search(query, context);
      return { moduleId, adapter, hits };
    })
  );

  const sections: SearchSection[] = [];

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Search adapter failed:', result.reason);
      continue;
    }

    const { moduleId, adapter, hits } = result.value;
    if (hits.length === 0) continue;

    const sorted = [...hits].toSorted((a, b) => b.score - a.score);

    sections.push({
      domain: adapter.domain,
      moduleId,
      icon: adapter.icon,
      color: adapter.color,
      isContextSection: currentApp ? isContextDomain(adapter.domain, currentApp) : false,
      hits: sorted.slice(0, HITS_PER_SECTION),
      totalCount: sorted.length,
    });
  }

  // Sort: context sections first, then by highest score descending
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

export interface ShowMoreResult {
  hits: SearchHit[];
  totalCount: number;
}

import { getSettingValue } from '../settings/service.js';

function getShowMoreLimit(): number {
  return getSettingValue('core.search.showMoreLimit', 5);
}

export interface ShowMoreOptions {
  domain: string;
  query: Query;
  context: SearchContext;
  offset: number;
  limit?: number;
  /** Test-only adapter source override; see `SearchAllOptions.adapters`. */
  adapters?: readonly OwnedAdapter[];
}

export async function showMore(opts: ShowMoreOptions): Promise<ShowMoreResult> {
  const adapters = opts.adapters ?? getOwnedAdapters();
  const owned = adapters.find((a) => a.adapter.domain === opts.domain);
  if (!owned) {
    throw new Error(`No search adapter registered for domain "${opts.domain}"`);
  }

  const limit = opts.limit ?? getShowMoreLimit();
  const hits = await owned.adapter.search(opts.query, opts.context);
  const sorted = [...hits].toSorted((a, b) => b.score - a.score);

  return {
    hits: sorted.slice(opts.offset, opts.offset + limit),
    totalCount: sorted.length,
  };
}
