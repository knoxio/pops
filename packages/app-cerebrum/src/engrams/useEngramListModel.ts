/**
 * View model for the Engrams list/search page.
 *
 * Routes the request to either:
 *   - `cerebrum.engrams.list` for plain filter-only browsing, or
 *   - `cerebrum.retrieval.search` (mode=hybrid) when a search query is
 *     entered, so the user gets semantic + structured matches per
 *     PRD-080.
 *
 * Pagination + filter state live here. The page component is a dumb
 * consumer of the returned shape.
 */
import { useMemo, useState } from 'react';

import { trpc } from '@pops/api-client';

import {
  DEFAULT_ENGRAM_FILTERS,
  ENGRAM_STATUSES,
  type EngramListFilters,
  type EngramStatus,
} from './types';

import type { Engram } from './types';

const DEFAULT_PAGE_SIZE = 25;

export interface EngramListModel {
  filters: EngramListFilters;
  setFilters: (next: EngramListFilters) => void;
  resetFilters: () => void;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  isSearching: boolean;
  isLoading: boolean;
  error: { message: string } | null;
  engrams: Engram[];
  total: number;
  scopeOptions: string[];
  scopesLoading: boolean;
  retry: () => void;
}

function asEngramStatus(value: string | null): EngramStatus | undefined {
  if (value === null) return undefined;
  return (ENGRAM_STATUSES as readonly string[]).includes(value)
    ? (value as EngramStatus)
    : undefined;
}

function buildListInput(filters: EngramListFilters, offset: number, limit: number) {
  const status = asEngramStatus(filters.status);
  return {
    ...(filters.scope ? { scopes: [filters.scope] } : {}),
    ...(filters.tag ? { tags: [filters.tag] } : {}),
    ...(status ? { status } : {}),
    limit,
    offset,
    sort: { field: 'modified_at', direction: 'desc' } as const,
  };
}

function buildSearchInput(filters: EngramListFilters, offset: number, limit: number) {
  const status = asEngramStatus(filters.status);
  return {
    query: filters.search,
    mode: 'hybrid' as const,
    filters: {
      ...(filters.scope ? { scopes: [filters.scope] } : {}),
      ...(filters.tag ? { tags: [filters.tag] } : {}),
      ...(status ? { status: [status] } : {}),
    },
    limit,
    offset,
    threshold: 0.8,
  };
}

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Unknown error';
}

function extractRetrievalIds(results: unknown): string[] {
  if (!Array.isArray(results)) return [];
  const ids: string[] = [];
  for (const r of results) {
    if (
      typeof r === 'object' &&
      r !== null &&
      'sourceId' in r &&
      typeof (r as { sourceId: unknown }).sourceId === 'string'
    ) {
      ids.push((r as { sourceId: string }).sourceId);
    }
  }
  return ids;
}

interface DerivedResult {
  engrams: Engram[];
  total: number;
  isLoading: boolean;
  error: { message: string } | null;
}

/**
 * Hook that owns the filter + pagination state. Split from
 * `useEngramListModel` so the model stays under the line/complexity
 * limits.
 */
function useFilterState() {
  const [filters, setFiltersState] = useState<EngramListFilters>(DEFAULT_ENGRAM_FILTERS);
  const [page, setPage] = useState(0);
  const setFilters = (next: EngramListFilters) => {
    setFiltersState(next);
    setPage(0);
  };
  const resetFilters = () => {
    setFiltersState(DEFAULT_ENGRAM_FILTERS);
    setPage(0);
  };
  return { filters, setFilters, resetFilters, page, setPage };
}

interface BrowseHook {
  result: DerivedResult;
  retry: () => void;
}

/**
 * Drives the non-search browsing path — a single
 * `cerebrum.engrams.list` query with status/scope/tag filters.
 */
function useBrowseList(filters: EngramListFilters, offset: number, enabled: boolean): BrowseHook {
  const query = trpc.cerebrum.engrams.list.useQuery(
    buildListInput(filters, offset, DEFAULT_PAGE_SIZE),
    { enabled }
  );
  return {
    result: {
      engrams: query.data?.engrams ?? [],
      total: query.data?.total ?? 0,
      isLoading: query.isLoading,
      error: query.error ? { message: extractMessage(query.error) } : null,
    },
    retry: () => void query.refetch(),
  };
}

/**
 * Drives the search path — hybrid retrieval against PRD-080, plus a
 * second `engrams.list({ ids })` query to hydrate the matched ids
 * into full Engram rows.
 */
function useSearchList(filters: EngramListFilters, offset: number, enabled: boolean): BrowseHook {
  const searchQuery = trpc.cerebrum.retrieval.search.useQuery(
    buildSearchInput(filters, offset, DEFAULT_PAGE_SIZE),
    { enabled }
  );
  const ids = useMemo<string[]>(
    () => (enabled ? extractRetrievalIds(searchQuery.data?.results) : []),
    [enabled, searchQuery.data]
  );
  const hydration = trpc.cerebrum.engrams.list.useQuery(
    { ids, limit: ids.length || 1 },
    { enabled: enabled && ids.length > 0 }
  );
  const engrams = hydration.data?.engrams ?? [];
  return {
    result: {
      engrams,
      total: searchQuery.data?.meta.total ?? engrams.length,
      isLoading: searchQuery.isLoading || (ids.length > 0 && hydration.isLoading),
      error: (() => {
        const errSrc = searchQuery.error ?? hydration.error;
        return errSrc ? { message: extractMessage(errSrc) } : null;
      })(),
    },
    retry: () => {
      void searchQuery.refetch();
      if (ids.length > 0) void hydration.refetch();
    },
  };
}

export function useEngramListModel(): EngramListModel {
  const { filters, setFilters, resetFilters, page, setPage } = useFilterState();
  const isSearching = filters.search.trim().length > 0;
  const offset = page * DEFAULT_PAGE_SIZE;

  const browse = useBrowseList(filters, offset, !isSearching);
  const search = useSearchList(filters, offset, isSearching);
  const scopesQuery = trpc.cerebrum.scopes.list.useQuery(undefined);

  const scopeOptions = useMemo(
    () => (scopesQuery.data?.scopes ?? []).map((s) => s.scope),
    [scopesQuery.data]
  );

  const active = isSearching ? search : browse;

  return {
    filters,
    setFilters,
    resetFilters,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    setPage,
    isSearching,
    isLoading: active.result.isLoading,
    error: active.result.error,
    engrams: active.result.engrams,
    total: active.result.total,
    scopeOptions,
    scopesLoading: scopesQuery.isLoading,
    retry: active.retry,
  };
}
