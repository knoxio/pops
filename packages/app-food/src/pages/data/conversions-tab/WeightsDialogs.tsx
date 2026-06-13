import { CreateWeightDialog, type IngredientOption } from './CreateWeightDialog';
import { EditWeightDialog } from './EditWeightDialog';

import type { CreateWeightInput, IngredientWeightRow, UpdateWeightInput } from './types';

interface WeightsDialogsProps {
  createOpen: boolean;
  editingRow: IngredientWeightRow | null;
  ingredients: readonly IngredientOption[];
  errorMessage: string | null;
  isCreating: boolean;
  isUpdating: boolean;
  openCreate: () => void;
  closeCreate: () => void;
  cancelEdit: () => void;
  submitCreate: (input: CreateWeightInput, onSuccess?: () => void) => void;
  submitUpdate: (id: number, patch: UpdateWeightInput, onSuccess?: () => void) => void;
}

export function WeightsDialogs({
  createOpen,
  editingRow,
  ingredients,
  errorMessage,
  isCreating,
  isUpdating,
  openCreate,
  closeCreate,
  cancelEdit,
  submitCreate,
  submitUpdate,
}: WeightsDialogsProps) {
  return (
    <>
      <CreateWeightDialog
        open={createOpen}
        onOpenChange={(open) => (open ? openCreate() : closeCreate())}
        ingredients={ingredients}
        errorMessage={errorMessage}
        isSubmitting={isCreating}
        onSubmit={(input) => submitCreate(input, closeCreate)}
      />
      <EditWeightDialog
        open={editingRow !== null}
        onOpenChange={(open) => {
          if (!open) cancelEdit();
        }}
        row={editingRow}
        errorMessage={errorMessage}
        isSubmitting={isUpdating}
        onSubmit={(id, patch) => submitUpdate(id, patch, cancelEdit)}
      />
    </>
  );
}
