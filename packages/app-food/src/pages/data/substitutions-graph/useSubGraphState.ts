/**
 * URL-state hook for the PRD-148 graph explorer. Reads search params,
 * exposes derived filter values + setters. Extracted from `SubGraphPage`
 * to keep the page component under the per-function lint cap.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import { nodeSlug } from './helpers';

import type { SubGraphEdge, SubGraphNode, SubGraphScope } from './types';

export interface SubGraphFilters {
  scope: SubGraphScope;
  recipeId: number | null;
  contextTag: string | null;
  search: string;
  focusedSlug: string | null;
  focusedEdgeId: string | null;
}

export interface SubGraphStateApi {
  filters: SubGraphFilters;
  queryInput: {
    scope: SubGraphScope;
    recipeId?: number;
    contextTag?: string;
    search?: string;
  };
  updateParam: (key: string, value: string | null) => void;
  selectNode: (node: SubGraphNode) => void;
  selectEdge: (edge: SubGraphEdge) => void;
  clearSelection: () => void;
}

export function useSubGraphState(): SubGraphStateApi {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readFilters(searchParams);
  const queryInput = useMemo(() => buildQueryInput(filters), [filters]);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const selectNode = useCallback(
    (node: SubGraphNode) => {
      const next = new URLSearchParams(searchParams);
      next.set('node', nodeSlug(node));
      next.delete('edge');
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams]
  );

  const selectEdge = useCallback(
    (edge: SubGraphEdge) => {
      const next = new URLSearchParams(searchParams);
      next.set('edge', String(edge.id));
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams]
  );

  const clearSelection = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('node');
    next.delete('edge');
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  return { filters, queryInput, updateParam, selectNode, selectEdge, clearSelection };
}

function readFilters(searchParams: URLSearchParams): SubGraphFilters {
  const recipeIdParam = searchParams.get('recipeId');
  const recipeId = recipeIdParam !== null && recipeIdParam !== '' ? Number(recipeIdParam) : null;
  return {
    scope: (searchParams.get('scope') as SubGraphScope | null) ?? 'global',
    recipeId,
    contextTag: searchParams.get('contextTag'),
    search: searchParams.get('q') ?? '',
    focusedSlug: searchParams.get('node'),
    focusedEdgeId: searchParams.get('edge'),
  };
}

function buildQueryInput(filters: SubGraphFilters): SubGraphStateApi['queryInput'] {
  return {
    scope: filters.scope,
    ...(filters.recipeId !== null ? { recipeId: filters.recipeId } : {}),
    ...(filters.contextTag !== null ? { contextTag: filters.contextTag } : {}),
    ...(filters.search !== '' ? { search: filters.search } : {}),
  };
}
