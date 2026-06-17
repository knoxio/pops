/**
 * Variant CRUD wiring for the detail panel. Owns the create + edit dialog
 * state and the per-row delete state.
 *
 * Errors:
 *   - CONFLICT on create  → slug-taken localised message
 *   - CONFLICT on delete  → FK reference (batch / line / sub / alias)
 *   - BAD_REQUEST         → invalid slug shape (PRD-106)
 */
import { useCallback, useState } from 'react';

import { useVariantActionMutations } from './useVariantActionMutations';

import type { IngredientVariantRow } from './ingredient-wire-types.js';
import type { VariantFormValues } from './VariantFormDialog';

type DialogMode = 'create' | 'edit';

interface DialogState {
  mode: DialogMode;
  variant: IngredientVariantRow | null;
}

export function useVariantActions(ingredientId: number | null) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IngredientVariantRow | null>(null);
  const mutations = useVariantActionMutations({
    onFormSuccess: () => setDialog(null),
    onDeleteSuccess: () => setDeleteTarget(null),
  });
  const formApi = useVariantFormApi({ mutations, dialog, ingredientId, setDialog });
  const deleteApi = useVariantDeleteApi({ mutations, deleteTarget, setDeleteTarget });
  return {
    dialog,
    deleteTarget,
    formError: mutations.formError,
    deleteError: mutations.deleteError,
    ...formApi,
    ...deleteApi,
    isSavingForm: mutations.create.isPending || mutations.update.isPending,
    isDeleting: mutations.delete.isPending,
  };
}

interface FormApiArgs {
  mutations: ReturnType<typeof useVariantActionMutations>;
  dialog: DialogState | null;
  ingredientId: number | null;
  setDialog: (next: DialogState | null) => void;
}

function useVariantFormApi({ mutations, dialog, ingredientId, setDialog }: FormApiArgs) {
  const submitForm = useCallback(
    (values: VariantFormValues) => {
      mutations.clearFormError();
      if (dialog === null) return;
      if (dialog.mode === 'create') {
        if (ingredientId === null) return;
        mutations.create.mutate({ ingredientId, ...values });
        return;
      }
      if (dialog.variant === null) return;
      mutations.update.mutate({ id: dialog.variant.id, ...values });
    },
    [mutations, dialog, ingredientId]
  );
  return {
    openCreate: () => {
      mutations.clearFormError();
      setDialog({ mode: 'create', variant: null });
    },
    openEdit: (variant: IngredientVariantRow) => {
      mutations.clearFormError();
      setDialog({ mode: 'edit', variant });
    },
    closeForm: () => {
      mutations.clearFormError();
      setDialog(null);
    },
    submitForm,
  };
}

interface DeleteApiArgs {
  mutations: ReturnType<typeof useVariantActionMutations>;
  deleteTarget: IngredientVariantRow | null;
  setDeleteTarget: (next: IngredientVariantRow | null) => void;
}

function useVariantDeleteApi({ mutations, deleteTarget, setDeleteTarget }: DeleteApiArgs) {
  const submitDelete = useCallback(() => {
    if (deleteTarget === null) return;
    mutations.clearDeleteError();
    mutations.delete.mutate({ id: deleteTarget.id });
  }, [mutations, deleteTarget]);
  return {
    openDelete: (variant: IngredientVariantRow) => {
      mutations.clearDeleteError();
      setDeleteTarget(variant);
    },
    closeDelete: () => {
      mutations.clearDeleteError();
      setDeleteTarget(null);
    },
    submitDelete,
  };
}
