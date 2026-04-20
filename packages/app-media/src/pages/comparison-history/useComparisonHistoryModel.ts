import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { useDebouncedValue } from '@pops/ui';

import { UNDO_DELAY_MS } from './UndoToast';

const PAGE_SIZE = 20;

export interface UseComparisonHistoryModelReturn {
  data: ReturnType<typeof trpc.media.comparisons.listAll.useQuery>['data'];
  isLoading: boolean;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  dimensionFilter: string;
  setDimensionFilter: (v: string) => void;
  searchInput: string;
  setSearchInput: (v: string) => void;
  pendingDeletes: Set<number>;
  dimensions: { id: number; name: string }[];
  totalPages: number;
  handleDelete: (id: number) => void;
  handleUndo: (id: number, toastId: string | number) => void;
}

function useDeleteMutation(setPendingDeletes: React.Dispatch<React.SetStateAction<Set<number>>>) {
  const utils = trpc.useUtils();
  return trpc.media.comparisons.delete.useMutation({
    onSuccess: (_data, variables) => {
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
      void utils.media.comparisons.listAll.invalidate();
      void utils.media.comparisons.scores.invalidate();
      void utils.media.comparisons.rankings.invalidate();
    },
    onError: (_error, variables) => {
      setPendingDeletes((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
      toast.error('Failed to delete comparison');
    },
  });
}

function useFilters() {
  const [page, setPage] = useState(0);
  const [dimensionFilter, setDimensionFilter] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  return {
    page,
    setPage,
    dimensionFilter,
    setDimensionFilter,
    searchInput,
    setSearchInput,
    debouncedSearch,
  };
}

function useDeleteFlow(
  renderToast: (id: number, onUndo: (toastId: string | number) => void) => string | number
) {
  const [pendingDeletes, setPendingDeletes] = useState<Set<number>>(new Set());
  const pendingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const deleteMutation = useDeleteMutation(setPendingDeletes);

  const handleUndo = useCallback((id: number, toastId: string | number) => {
    const timer = pendingTimers.current.get(id);
    if (timer) clearTimeout(timer);
    pendingTimers.current.delete(id);
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.dismiss(toastId);
  }, []);

  const handleDelete = useCallback(
    (id: number) => {
      setPendingDeletes((prev) => new Set(prev).add(id));
      const toastId = renderToast(id, (tId) => handleUndo(id, tId));
      const timer = setTimeout(() => {
        pendingTimers.current.delete(id);
        toast.dismiss(toastId);
        deleteMutation.mutate({ id });
      }, UNDO_DELAY_MS);
      pendingTimers.current.set(id, timer);
    },
    [deleteMutation, handleUndo, renderToast]
  );

  return { pendingDeletes, handleDelete, handleUndo };
}

export function useComparisonHistoryModel(
  renderToast: (id: number, onUndo: (toastId: string | number) => void) => string | number
) {
  const filters = useFilters();
  const { pendingDeletes, handleDelete, handleUndo } = useDeleteFlow(renderToast);

  const { data: dimensionsData } = trpc.media.comparisons.listDimensions.useQuery();
  const dimensions = dimensionsData?.data ?? [];

  const { data, isLoading } = trpc.media.comparisons.listAll.useQuery({
    dimensionId: filters.dimensionFilter ? Number(filters.dimensionFilter) : undefined,
    search: filters.debouncedSearch.trim() || undefined,
    limit: PAGE_SIZE,
    offset: filters.page * PAGE_SIZE,
  });

  const totalPages = data?.pagination ? Math.ceil(data.pagination.total / PAGE_SIZE) : 0;

  return {
    data,
    isLoading,
    page: filters.page,
    setPage: filters.setPage,
    dimensionFilter: filters.dimensionFilter,
    setDimensionFilter: filters.setDimensionFilter,
    searchInput: filters.searchInput,
    setSearchInput: filters.setSearchInput,
    pendingDeletes,
    dimensions,
    totalPages,
    handleDelete,
    handleUndo,
  };
}
