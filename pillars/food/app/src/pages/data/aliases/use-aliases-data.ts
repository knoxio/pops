/**
 * Aliases tab data + selection state.
 *
 * Wraps `aliasesListWithTargets` plus the table's own UI state
 * (sort, filter, selection). Mutations live alongside in
 * `use-aliases-mutations.ts` so each hook stays narrowly focused.
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { unwrap } from '../../../food-api-helpers.js';
import { aliasesListWithTargets } from '../../../food-api/index.js';
import { sortAliases } from './format.js';

import type { AliasesListWithTargetsResponses } from '../../../food-api/types.gen.js';
import type {
  AliasesFilter,
  AliasRow,
  AliasSortKey,
  AliasTarget,
  SortDirection,
  SortState,
} from './types.js';

type AliasesListWithTargetsOutput = AliasesListWithTargetsResponses[200];

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

  const query = useQuery({
    queryKey: ['food', 'aliases', 'listWithTargets', queryInput],
    queryFn: async (): Promise<AliasesListWithTargetsOutput> =>
      unwrap(await aliasesListWithTargets({ query: queryInput })),
  });

  const rows = useMemo(() => {
    if (query.data === undefined) return [];
    const all = toRows(query.data.items);
    return sortAliases(all, sort.key, sort.direction);
  }, [query.data, sort]);

  const setSort = useCallback((key: AliasSortKey) => {
    setSortState((prev) => ({ key, direction: nextDirection(prev, key) }));
  }, []);

  // Filter changes always clear the current selection — once the visible
  // rows change, the selection count + has-llm-selection flags would
  // otherwise reflect rows the user can no longer see, which makes the
  // toolbar's enabled state misleading.
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
