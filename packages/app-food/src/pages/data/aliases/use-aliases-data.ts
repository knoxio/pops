/**
 * Aliases tab data + selection state (PRD-122-C).
 *
 * Wraps `trpc.food.aliases.listWithTargets` plus the table's own UI state
 * (sort, filter, selection). Mutations live alongside in
 * `use-aliases-mutations.ts` so each hook stays narrowly focused.
 */
import { useCallback, useMemo, useState } from 'react';

import { usePillarQuery } from '@pops/pillar-sdk/react';

import { sortAliases } from './format.js';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

import type {
  AliasesFilter,
  AliasRow,
  AliasSortKey,
  AliasTarget,
  SortDirection,
  SortState,
} from './types.js';

type AliasesListWithTargetsOutput =
  inferRouterOutputs<AppRouter>['food']['aliases']['listWithTargets'];

const DEFAULT_SORT: SortState = { key: 'alias', direction: 'asc' };

export interface UseAliasesData {
  readonly rows: readonly AliasRow[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly filter: AliasesFilter;
  readonly setFilter: (next: AliasesFilter) => void;
  readonly sort: SortState;
  readonly setSort: (key: AliasSortKey) => void;
  readonly selectedIds: ReadonlySet<number>;
  readonly toggleSelection: (id: number) => void;
  readonly selectAll: () => void;
  readonly clearSelection: () => void;
  readonly hasLlmSelection: boolean;
}

function nextDirection(prev: SortState, key: AliasSortKey): SortDirection {
  if (prev.key !== key) return 'asc';
  return prev.direction === 'asc' ? 'desc' : 'asc';
}

function toRows(items: readonly AliasRowFromServer[]): AliasRow[] {
  return items.map((item) => ({
    id: item.alias.id,
    alias: item.alias.alias,
    source: item.alias.source,
    createdAt: item.alias.createdAt,
    target: item.target,
  }));
}

interface AliasRowFromServer {
  readonly alias: {
    readonly id: number;
    readonly alias: string;
    readonly source: AliasRow['source'];
    readonly createdAt: string;
  };
  readonly target: AliasTarget;
}

export function useAliasesData(): UseAliasesData {
  const [filter, setFilterState] = useState<AliasesFilter>({ source: null, search: '' });
  const [sort, setSortState] = useState<SortState>(DEFAULT_SORT);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());

  const queryInput = useMemo(() => {
    const input: { source?: AliasRow['source']; search?: string } = {};
    if (filter.source !== null) input.source = filter.source;
    if (filter.search.length > 0) input.search = filter.search;
    return input;
  }, [filter]);

  const query = usePillarQuery<AliasesListWithTargetsOutput>(
    'food',
    ['aliases', 'listWithTargets'],
    queryInput
  );

  const rows = useMemo(() => {
    if (query.data === undefined) return [];
    const all = toRows(query.data.items as readonly AliasRowFromServer[]);
    return sortAliases(all, sort.key, sort.direction);
  }, [query.data, sort]);

  const setSort = useCallback((key: AliasSortKey) => {
    setSortState((prev) => ({ key, direction: nextDirection(prev, key) }));
  }, []);

  // Filter changes always clear the current selection — once the visible
  // rows change, the selection count + has-llm-selection flags would
  // otherwise reflect rows the user can no longer see, which makes the
  // toolbar's enabled state misleading (Copilot review on PR #2724).
  const setFilter = useCallback((next: AliasesFilter) => {
    setFilterState(next);
    setSelectedIds(new Set());
  }, []);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(rows.map((r) => r.id)));
  }, [rows]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const hasLlmSelection = useMemo(
    () => rows.some((row) => selectedIds.has(row.id) && row.source === 'llm'),
    [rows, selectedIds]
  );

  return {
    rows,
    isLoading: query.isLoading,
    isError: query.isError,
    filter,
    setFilter,
    sort,
    setSort,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    hasLlmSelection,
  };
}
