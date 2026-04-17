/**
 * Search fan-out engine — fans a query to all registered adapters via
 * Promise.allSettled, groups results into sections, and orders context
 * sections (current app) first.
 */
import { isContextDomain } from './domain-app-mapping.js';
import { getAdapters } from './registry.js';

import type { Query, SearchContext, SearchHit } from './types.js';

export interface SearchSection {
  domain: string;
  icon: string;
  color: string;
  isContextSection: boolean;
  hits: SearchHit[];
  totalCount: number;
}

export interface SearchAllResult {
  sections: SearchSection[];
}

const HITS_PER_SECTION = 5;

export async function searchAll(query: Query, context: SearchContext): Promise<SearchAllResult> {
  const adapters = getAdapters();
  const currentApp = context.app;

  const results = await Promise.allSettled(
    adapters.map(async (adapter) => {
      const hits = await adapter.search(query, context);
      return { adapter, hits };
    })
  );

  const sections: SearchSection[] = [];

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Search adapter failed:', result.reason);
      continue;
    }

    const { adapter, hits } = result.value;
    if (hits.length === 0) continue;

    const sorted = [...hits].toSorted((a, b) => b.score - a.score);

    sections.push({
      domain: adapter.domain,
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

const DEFAULT_SHOW_MORE_LIMIT = 5;

export async function showMore(
  domain: string,
  query: Query,
  context: SearchContext,
  offset: number,
  limit: number = DEFAULT_SHOW_MORE_LIMIT
): Promise<ShowMoreResult> {
  const adapter = getAdapters().find((a) => a.domain === domain);
  if (!adapter) {
    throw new Error(`No search adapter registered for domain "${domain}"`);
  }

  const hits = await adapter.search(query, context);
  const sorted = [...hits].toSorted((a, b) => b.score - a.score);

  return {
    hits: sorted.slice(offset, offset + limit),
    totalCount: sorted.length,
  };
}
