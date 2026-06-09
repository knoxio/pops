/**
 * Hook that wraps the rename / change-parent / delete mutations for an
 * ingredient row. State is fragmented per dialog so the parent component
 * can render only the controls relevant to the open modal.
 *
 * Each mutation invalidates the relevant tRPC caches on success so the
 * tree, detail panel, and blocker counts stay coherent.
 *
 * The mutation factories live in `useIngredientActionMutations.ts` to
 * keep this hook's body under the per-function lint cap.
 */
import { useCallback, useState } from 'react';

import { useIngredientActionMutations } from './useIngredientActionMutations';

interface OpenDialogs {
  rename: boolean;
  changeParent: boolean;
  delete: boolean;
}

const CLOSED: OpenDialogs = { rename: false, changeParent: false, delete: false };

export function useIngredientActions(ingredientId: number | null) {
  const [open, setOpen] = useState<OpenDialogs>(CLOSED);
  const [hasOtherFkRefs, setHasOtherFkRefs] = useState(false);
  const mutations = useIngredientActionMutations({
    closeAll: useCallback(() => {
      setOpen(CLOSED);
      setHasOtherFkRefs(false);
    }, []),
    onDeleteOtherFkRef: useCallback(() => setHasOtherFkRefs(true), []),
  });

  const clearErrors = useCallback(() => {
    mutations.clearErrors();
    setHasOtherFkRefs(false);
  }, [mutations]);

  const submitters = buildSubmitters({ mutations, ingredientId, setHasOtherFkRefs });
  const dialogs = buildDialogOpeners({ clearErrors, setOpen });

  return {
    open,
    ...dialogs,
    ...submitters,
    renameError: mutations.errors.rename,
    changeParentError: mutations.errors.changeParent,
    deleteError: mutations.errors.delete,
    hasOtherFkRefs,
    isRenaming: mutations.rename.isPending,
    isChangingParent: mutations.changeParent.isPending,
    isDeleting: mutations.delete.isPending,
  };
}

function buildSubmitters({
  mutations,
  ingredientId,
  setHasOtherFkRefs,
}: {
  mutations: ReturnType<typeof useIngredientActionMutations>;
  ingredientId: number | null;
  setHasOtherFkRefs: (next: boolean) => void;
}) {
  return {
    submitRename: (oldSlug: string, newSlug: string) => {
      mutations.clearErrors();
      mutations.rename.mutate({ oldSlug, newSlug });
    },
    submitChangeParent: (newParentId: number | null) => {
      if (ingredientId === null) return;
      mutations.clearErrors();
      mutations.changeParent.mutate({ id: ingredientId, newParentId });
    },
    submitDelete: () => {
      if (ingredientId === null) return;
      mutations.clearErrors();
      setHasOtherFkRefs(false);
      mutations.delete.mutate({ id: ingredientId });
    },
  };
}

function buildDialogOpeners({
  clearErrors,
  setOpen,
}: {
  clearErrors: () => void;
  setOpen: (next: OpenDialogs) => void;
}) {
  return {
    openRename: () => {
      clearErrors();
      setOpen({ ...CLOSED, rename: true });
    },
    openChangeParent: () => {
      clearErrors();
      setOpen({ ...CLOSED, changeParent: true });
    },
    openDelete: () => {
      clearErrors();
      setOpen({ ...CLOSED, delete: true });
    },
    closeAll: () => {
      clearErrors();
      setOpen(CLOSED);
    },
  };
}
