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

import { trpc } from '@pops/api-client';

import { buildIngredientTree } from './buildIngredientTree';

import type { TFunction } from 'i18next';

import type { CreateIngredientInput } from './CreateIngredientDialog';

/**
 * Map a tRPC mutation error to a user-facing localized message.
 *
 * The router layer (PRD-122-API) translates service errors to typed
 * `TRPCError` codes:
 *   - InvalidSlugError                       → BAD_REQUEST
 *   - SlugAlreadyRegisteredError             → CONFLICT
 *   - IngredientHierarchyDepthExceeded       → BAD_REQUEST (message includes "Depth")
 *   - IngredientCycleError                   → BAD_REQUEST (message includes "cycle")
 *
 * BAD_REQUEST collapses three distinct service errors; the original
 * `err.message` is the only signal that differentiates them. The mapping
 * here is intentionally conservative — anything unrecognised falls back
 * to the generic message rather than leaking raw service strings.
 */
function mapCreateError(
  err: { data?: { code?: string } | null; message: string },
  t: TFunction
): string {
  const code = err.data?.code;
  if (code === 'CONFLICT') return t('data.ingredients.create.error.slugTaken');
  if (code === 'BAD_REQUEST') {
    if (/cycle/i.test(err.message)) return t('data.ingredients.create.error.cycle');
    if (/depth/i.test(err.message)) return t('data.ingredients.create.error.hierarchyTooDeep');
    return t('data.ingredients.create.error.invalidSlug');
  }
  return t('data.ingredients.create.error.generic');
}

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
  return { expandedIds, toggleNode };
}

function useCreateDialog() {
  const { t } = useTranslation('food');
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const mutation = trpc.food.ingredients.create.useMutation({
    onSuccess: () => {
      setErrorMessage(null);
      setOpen(false);
      void utils.food.ingredients.list.invalidate();
    },
    onError: (err) => setErrorMessage(mapCreateError(err, t)),
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
 * the `detail` field carries the per-procedure tRPC useQuery shape
 * with full `data` typing. An explicit annotation collapses it back
 * to the generic `{}` data type.
 */
export function useIngredientsTab() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const { expandedIds, toggleNode } = useExpandedSet();
  const createDialog = useCreateDialog();

  const listQuery = trpc.food.ingredients.list.useQuery({
    search: search.length > 0 ? search : undefined,
  });
  const detail = trpc.food.ingredients.get.useQuery(
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
    openCreateDialog: createDialog.openDialog,
    closeCreateDialog: createDialog.closeDialog,
    submitCreate: createDialog.submit,
  };
}
