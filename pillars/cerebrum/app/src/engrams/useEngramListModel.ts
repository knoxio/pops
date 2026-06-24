/**
 * View model for the Engrams list/search page.
 *
 * Routes the request to either:
 *   - `engramsList` (`POST /engrams/search`) for plain filter-only
 *     browsing, or
 *   - `retrievalSearch` (`POST /retrieval/search`, mode=hybrid) when a
 *     search query is entered, so the user gets semantic + structured
 *     matches.
 *
 * Pagination + filter state live here. The page component is a dumb
 * consumer of the returned shape.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { engramsList, retrievalSearch, scopesList } from '../cerebrum-api';
import { unwrap } from '../cerebrum-api-helpers';
import { extractMessage } from '../utils/errors';
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
 * Drives the non-search browsing path — a single `engramsList` query
 * with status/scope/tag filters.
 */
function useBrowseList(filters: EngramListFilters, offset: number, enabled: boolean): BrowseHook {
  const { t } = useTranslation('cerebrum');
  const input = buildListInput(filters, offset, DEFAULT_PAGE_SIZE);
  const query = useQuery({
    queryKey: ['cerebrum', 'engrams', 'list', input],
    queryFn: async () => unwrap(await engramsList({ body: input })),
    enabled,
  });
  return {
    result: {
      engrams: query.data?.engrams ?? [],
      total: query.data?.total ?? 0,
      isLoading: query.isLoading,
      error: query.error ? { message: extractMessage(query.error, t('errors.unknown')) } : null,
    },
    retry: () => void query.refetch(),
  };
}

/**
 * Drives the search path — hybrid retrieval via `retrievalSearch`,
 * plus a second `engramsList({ ids })` query to hydrate the matched
 * ids into full Engram rows.
 */
function useSearchList(filters: EngramListFilters, offset: number, enabled: boolean): BrowseHook {
  const { t } = useTranslation('cerebrum');
  const searchInput = buildSearchInput(filters, offset, DEFAULT_PAGE_SIZE);
  const searchQuery = useQuery({
    queryKey: ['cerebrum', 'retrieval', 'search', searchInput],
    queryFn: async () => unwrap(await retrievalSearch({ body: searchInput })),
    enabled,
  });
  const ids = useMemo<string[]>(
    () => (enabled ? extractRetrievalIds(searchQuery.data?.results) : []),
    [enabled, searchQuery.data]
  );
  const hydrationInput = { ids, limit: ids.length || 1 };
  const hydration = useQuery({
    queryKey: ['cerebrum', 'engrams', 'list', hydrationInput],
    queryFn: async () => unwrap(await engramsList({ body: hydrationInput })),
    enabled: enabled && ids.length > 0,
  });
  const engrams = hydration.data?.engrams ?? [];
  return {
    result: {
      engrams,
      total: searchQuery.data?.meta.total ?? engrams.length,
      isLoading: searchQuery.isLoading || (ids.length > 0 && hydration.isLoading),
      error: (() => {
        const errSrc = searchQuery.error ?? hydration.error;
        return errSrc ? { message: extractMessage(errSrc, t('errors.unknown')) } : null;
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
  const scopesQuery = useQuery({
    queryKey: ['cerebrum', 'scopes', 'list'],
    queryFn: async () => unwrap(await scopesList({ query: {} })),
  });

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
