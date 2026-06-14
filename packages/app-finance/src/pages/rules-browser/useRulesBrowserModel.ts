import { useCallback, useState } from 'react';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import { useRuleFormState } from './rule-form/useRuleFormState';

import type { Correction, MatchType } from './types';

export const PAGE_SIZE = 50;

interface CorrectionsListResult {
  data: Correction[];
  pagination: { total: number; limit: number; offset: number };
}

interface DeleteCorrectionInput {
  id: string;
}

function parseMatchType(value: string): MatchType | undefined {
  return value === 'exact' || value === 'contains' || value === 'regex' ? value : undefined;
}

interface FilterState {
  matchType: string;
  setMatchType: (v: string) => void;
  minConfidence: string;
  setMinConfidence: (v: string) => void;
  offset: number;
  setOffset: (next: number | ((prev: number) => number)) => void;
}

function useFilterState(): FilterState {
  const [matchType, setMatchType] = useState('');
  const [minConfidence, setMinConfidence] = useState('');
  const [offset, setOffsetState] = useState(0);
  const setOffset = useCallback((next: number | ((prev: number) => number)) => {
    setOffsetState((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);
  return { matchType, setMatchType, minConfidence, setMinConfidence, offset, setOffset };
}

function useDeleteFlow() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const utils = usePillarUtils('core');
  const deleteMutation = usePillarMutation<DeleteCorrectionInput, unknown>(
    'core',
    ['corrections', 'delete'],
    {
      onSuccess: () => {
        void utils.invalidate(['corrections', 'list']);
        setDeleteId(null);
        setRemovedIds(new Set());
      },
    }
  );
  const handleDelete = useCallback(() => {
    if (!deleteId) return;
    deleteMutation.mutate({ id: deleteId });
  }, [deleteId, deleteMutation]);
  const handleAutoDelete = useCallback((id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id));
  }, []);
  return { deleteId, setDeleteId, removedIds, deleteMutation, handleDelete, handleAutoDelete };
}

function useCorrectionsListQuery(filters: FilterState) {
  return usePillarQuery<CorrectionsListResult>('core', ['corrections', 'list'], {
    minConfidence: filters.minConfidence ? parseFloat(filters.minConfidence) : undefined,
    matchType: parseMatchType(filters.matchType),
    limit: PAGE_SIZE,
    offset: filters.offset,
  });
}

export function useRulesBrowserModel() {
  const filters = useFilterState();
  const del = useDeleteFlow();
  const [isFormOpen, setIsFormOpen] = useState(false);

  const ruleForm = useRuleFormState({ onClose: () => setIsFormOpen(false) });

  const { data, isLoading, isError, refetch } = useCorrectionsListQuery(filters);

  const corrections: Correction[] = (data?.data ?? []).filter(
    (c: Correction) => !del.removedIds.has(c.id)
  );
  const pagination = data?.pagination;
  const totalPages = pagination ? Math.ceil(pagination.total / PAGE_SIZE) : 1;
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1;

  const resetPage = useCallback(() => filters.setOffset(0), [filters]);

  const handleAddRule = useCallback(() => {
    ruleForm.handleAdd();
    setIsFormOpen(true);
  }, [ruleForm]);

  const handleEditRule = useCallback(
    (rule: Correction) => {
      ruleForm.handleEdit(rule);
      setIsFormOpen(true);
    },
    [ruleForm]
  );

  return {
    matchType: filters.matchType,
    setMatchType: filters.setMatchType,
    minConfidence: filters.minConfidence,
    setMinConfidence: filters.setMinConfidence,
    offset: filters.offset,
    setOffset: filters.setOffset,
    resetPage,
    deleteId: del.deleteId,
    setDeleteId: del.setDeleteId,
    isLoading,
    isError,
    refetch,
    corrections,
    pagination,
    totalPages,
    currentPage,
    deleteMutation: del.deleteMutation,
    handleDelete: del.handleDelete,
    handleAutoDelete: del.handleAutoDelete,
    isFormOpen,
    setIsFormOpen,
    ruleForm,
    handleAddRule,
    handleEditRule,
  };
}
