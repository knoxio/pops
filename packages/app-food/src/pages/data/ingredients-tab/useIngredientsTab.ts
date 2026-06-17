/**
 * Data + UI state for the ingredients tab.
 *
 * Owns the list query (`ingredientsList`), the per-selection detail
 * query (`ingredientsGet`), and the local state for selection, tree
 * expansion, and the create dialog. The page-level component composes
 * these into the tree + detail panel layout.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { unwrap } from '../../../food-api-helpers.js';
import { ingredientsCreate, ingredientsGet, ingredientsList } from '../../../food-api/index.js';
import { buildIngredientTree } from './buildIngredientTree';
import { mapMutationError } from './errors';

import type { CreateIngredientInput } from './CreateIngredientDialog';

function useExpandedSet() {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const toggleNode = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expandMany = useCallback((ids: readonly number[]) => {
    if (ids.length === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);
  return { expandedIds, toggleNode, expandMany };
}

function useCreateDialog() {
  const { t } = useTranslation('food');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (input: CreateIngredientInput) =>
      unwrap(await ingredientsCreate({ body: input })),
    onSuccess: () => {
      setErrorMessage(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['food', 'ingredients', 'list'] });
    },
    onError: (err: Error) =>
      setErrorMessage(
        mapMutationError(err, t, { fallbackKey: 'data.ingredients.create.error.generic' })
      ),
  });
  const submit = useCallback(
    (input: CreateIngredientInput) => {
      setErrorMessage(null);
      mutation.mutate(input);
    },
    [mutation]
  );
  const openDialog = useCallback(() => {
    setErrorMessage(null);
    setOpen(true);
  }, []);
  const closeDialog = useCallback(() => {
    setOpen(false);
    setErrorMessage(null);
  }, []);
  return {
    open,
    errorMessage,
    isPending: mutation.isPending,
    submit,
    openDialog,
    closeDialog,
  };
}

/**
 * Return type is intentionally inferred (not explicitly annotated) so
 * the `detail` field carries the per-query react-query shape with full
 * `data` typing (`{ ingredient, variants }`). An explicit annotation
 * collapses it back to the generic data type.
 */
export function useIngredientsTab() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const { expandedIds, toggleNode, expandMany } = useExpandedSet();
  const createDialog = useCreateDialog();

  const listInput = { search: search.length > 0 ? search : undefined };
  const listQuery = useQuery({
    queryKey: ['food', 'ingredients', 'list', listInput],
    queryFn: async () => unwrap(await ingredientsList({ query: listInput })),
  });
  const detail = useQuery({
    queryKey: ['food', 'ingredients', 'get', selectedId],
    queryFn: async () =>
      unwrap(await ingredientsGet({ path: { idOrSlug: String(selectedId ?? 0) } })),
    enabled: selectedId !== null,
  });

  const flatIngredients = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
  const tree = useMemo(() => buildIngredientTree(flatIngredients), [flatIngredients]);
  const selectIngredient = useCallback((id: number) => setSelectedId(id), []);

  return {
    tree,
    flatIngredients,
    selectedId,
    expandedIds,
    search,
    isLoadingList: listQuery.isLoading,
    detail,
    createDialogOpen: createDialog.open,
    isCreatingIngredient: createDialog.isPending,
    createErrorMessage: createDialog.errorMessage,
    setSearch,
    selectIngredient,
    toggleNode,
    expandMany,
    openCreateDialog: createDialog.openDialog,
    closeCreateDialog: createDialog.closeDialog,
    submitCreate: createDialog.submit,
  };
}
