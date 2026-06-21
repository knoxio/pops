/**
 * Modal collection for the selected ingredient. Kept in its own file so
 * `IngredientsTabContents` stays under the per-function and per-file caps.
 */
import { ChangeParentDialog } from './ChangeParentDialog';
import { DeleteIngredientDialog } from './DeleteIngredientDialog';
import { DeleteVariantDialog } from './DeleteVariantDialog';
import { RenameIngredientDialog } from './RenameIngredientDialog';
import { VariantFormDialog } from './VariantFormDialog';

import type { DeleteBlockerSummary, IngredientRow } from './ingredient-wire-types.js';
import type { useIngredientActions } from './useIngredientActions';
import type { useVariantActions } from './useVariantActions';

type IngredientActions = ReturnType<typeof useIngredientActions>;
type VariantActions = ReturnType<typeof useVariantActions>;

interface Props {
  ingredient: IngredientRow;
  ingredients: readonly IngredientRow[];
  ingredientActions: IngredientActions;
  variantActions: VariantActions;
  blockers: DeleteBlockerSummary | null;
  recipeRefCountForDelete: number;
  deleteRefsLoading: boolean;
}

export function IngredientTabDialogs(props: Props) {
  return (
    <>
      <IngredientDialogStack {...props} />
      <VariantDialogStack variantActions={props.variantActions} />
    </>
  );
}

function IngredientDialogStack({
  ingredient,
  ingredients,
  ingredientActions,
  blockers,
  recipeRefCountForDelete,
  deleteRefsLoading,
}: Props) {
  return (
    <>
      <RenameIngredientDialog
        open={ingredientActions.open.rename}
        currentSlug={ingredient.slug}
        isSubmitting={ingredientActions.isRenaming}
        errorMessage={ingredientActions.renameError}
        onCancel={ingredientActions.closeAll}
        onSubmit={(newSlug) => ingredientActions.submitRename(ingredient.slug, newSlug)}
      />
      <ChangeParentDialog
        open={ingredientActions.open.changeParent}
        ingredient={ingredient}
        ingredients={ingredients}
        isSubmitting={ingredientActions.isChangingParent}
        errorMessage={ingredientActions.changeParentError}
        onCancel={ingredientActions.closeAll}
        onSubmit={ingredientActions.submitChangeParent}
      />
      <DeleteIngredientDialog
        open={ingredientActions.open.delete}
        ingredient={ingredient}
        blockers={blockers}
        recipeRefCount={recipeRefCountForDelete}
        hasOtherFkRefs={ingredientActions.hasOtherFkRefs}
        isSubmitting={ingredientActions.isDeleting}
        isResolvingRefs={deleteRefsLoading}
        errorMessage={ingredientActions.deleteError}
        onCancel={ingredientActions.closeAll}
        onConfirm={ingredientActions.submitDelete}
      />
    </>
  );
}

function VariantDialogStack({ variantActions }: { variantActions: VariantActions }) {
  return (
    <>
      {variantActions.dialog !== null ? (
        <VariantFormDialog
          open
          mode={variantActions.dialog.mode}
          initial={variantActions.dialog.variant}
          isSubmitting={variantActions.isSavingForm}
          errorMessage={variantActions.formError}
          onCancel={variantActions.closeForm}
          onSubmit={variantActions.submitForm}
        />
      ) : null}
      {variantActions.deleteTarget !== null ? (
        <DeleteVariantDialog
          variant={variantActions.deleteTarget}
          isSubmitting={variantActions.isDeleting}
          errorMessage={variantActions.deleteError}
          onCancel={variantActions.closeDelete}
          onConfirm={variantActions.submitDelete}
        />
      ) : null}
    </>
  );
}
