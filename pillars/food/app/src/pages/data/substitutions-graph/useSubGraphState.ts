/**
 * URL-state hook for the graph explorer. Reads search params, exposes
 * derived filter values + setters.
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
  /** Resets every filter + selection to the empty state — wired into the
   * empty-state "Clear filters" button so over-filtered URLs can be
   * recovered without manual editing. */
  clearAllFilters: () => void;
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

  const clearAllFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  return {
    filters,
    queryInput,
    updateParam,
    selectNode,
    selectEdge,
    clearSelection,
    clearAllFilters,
  };
}

const VALID_SCOPES: readonly SubGraphScope[] = ['global', 'recipe'];

function parseScope(raw: string | null): SubGraphScope {
  if (raw !== null && (VALID_SCOPES as readonly string[]).includes(raw)) {
    return raw as SubGraphScope;
  }
  return 'global';
}

function parseRecipeId(raw: string | null): number | null {
  if (raw === null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonEmpty(raw: string | null): string | null {
  return raw !== null && raw !== '' ? raw : null;
}

function readFilters(searchParams: URLSearchParams): SubGraphFilters {
  return {
    scope: parseScope(searchParams.get('scope')),
    recipeId: parseRecipeId(searchParams.get('recipeId')),
    contextTag: nonEmpty(searchParams.get('contextTag')),
    search: searchParams.get('q') ?? '',
    focusedSlug: nonEmpty(searchParams.get('node')),
    focusedEdgeId: nonEmpty(searchParams.get('edge')),
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
