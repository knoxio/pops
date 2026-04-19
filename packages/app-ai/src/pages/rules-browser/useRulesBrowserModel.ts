import { useCallback, useState } from 'react';

import { trpc } from '@pops/api-client';

import type { Correction, MatchType } from './types';

export const PAGE_SIZE = 50;

function parseMatchType(value: string): MatchType | undefined {
  return value === 'exact' || value === 'contains' || value === 'regex' ? value : undefined;
}

export function useRulesBrowserModel() {
  const [matchType, setMatchType] = useState('');
  const [minConfidence, setMinConfidence] = useState('');
  const [offset, setOffset] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const queryInput = {
    minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
    matchType: parseMatchType(matchType),
    limit: PAGE_SIZE,
    offset,
  };

  const { data, isLoading, isError, refetch } = trpc.core.corrections.list.useQuery(queryInput);
  const utils = trpc.useUtils();

  const deleteMutation = trpc.core.corrections.delete.useMutation({
    onSuccess: () => {
      void utils.core.corrections.list.invalidate();
      setDeleteId(null);
      setRemovedIds(new Set());
    },
  });

  const handleDelete = useCallback(() => {
    if (!deleteId) return;
    deleteMutation.mutate({ id: deleteId });
  }, [deleteId, deleteMutation]);

  const handleAutoDelete = useCallback((id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id));
  }, []);

  const corrections: Correction[] = (data?.data ?? []).filter(
    (c: Correction) => !removedIds.has(c.id)
  );
  const pagination = data?.pagination;
  const totalPages = pagination ? Math.ceil(pagination.total / PAGE_SIZE) : 1;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const resetPage = useCallback(() => {
    setOffset(0);
  }, []);

  return {
    matchType,
    setMatchType,
    minConfidence,
    setMinConfidence,
    offset,
    setOffset,
    resetPage,
    deleteId,
    setDeleteId,
    isLoading,
    isError,
    refetch,
    corrections,
    pagination,
    totalPages,
    currentPage,
    deleteMutation,
    handleDelete,
    handleAutoDelete,
  };
}
