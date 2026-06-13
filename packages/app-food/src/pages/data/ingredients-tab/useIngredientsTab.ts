/**
 * Data + UI state for the ingredients tab.
 *
 * Owns the list query (`food.ingredients.list`), the per-selection detail
 * query (`food.ingredients.get`), and the local state for selection, tree
 * expansion, and the create dialog. The page-level component composes
 * these into the tree + detail panel layout.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';

import { buildIngredientTree } from './buildIngredientTree';
import { mapMutationError } from './errors';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

import type { CreateIngredientInput } from './CreateIngredientDialog';

type IngredientsListOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['list'];
type IngredientsGetOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['get'];
type IngredientsCreateInput = inferRouterInputs<AppRouter>['food']['ingredients']['create'];
type IngredientsCreateOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['create'];

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
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const utils = usePillarUtils('food');
  const mutation = usePillarMutation<IngredientsCreateInput, IngredientsCreateOutput>(
    'food',
    ['ingredients', 'create'],
    {
      onSuccess: () => {
        setErrorMessage(null);
        setOpen(false);
        void utils.invalidate(['ingredients', 'list']);
      },
      onError: (err) =>
        setErrorMessage(
          mapMutationError(err, t, { fallbackKey: 'data.ingredients.create.error.generic' })
        ),
    }
  );
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
 * the `detail` field carries the per-procedure tRPC useQuery shape
 * with full `data` typing. An explicit annotation collapses it back
 * to the generic `{}` data type.
 */
export function useIngredientsTab() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const { expandedIds, toggleNode, expandMany } = useExpandedSet();
  const createDialog = useCreateDialog();

  const listQuery = usePillarQuery<IngredientsListOutput>('food', ['ingredients', 'list'], {
    search: search.length > 0 ? search : undefined,
  });
  const detail = usePillarQuery<IngredientsGetOutput>(
    'food',
    ['ingredients', 'get'],
    { idOrSlug: selectedId ?? 0 },
    { enabled: selectedId !== null }
  );

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
