/**
 * Visual scaffolding for the ingredients tab — left column (tree), right
 * column (detail), and the not-found banner. Kept separate from
 * `IngredientsTabContents` so the orchestrating component stays under the
 * complexity + length lint caps.
 */
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { CreateIngredientDialog } from './CreateIngredientDialog';
import { IngredientTabDialogs } from './ingredient-tab-dialogs';
import { IngredientDetailPanel } from './IngredientDetailPanel';
import { IngredientsTree } from './IngredientsTree';

import type {
  DeleteBlockerSummary,
  IngredientRow,
  IngredientVariantRow,
} from './ingredient-wire-types.js';
import type { useFocusedIngredient } from './useFocusedIngredient';
import type { useIngredientActions } from './useIngredientActions';
import type { useIngredientsTab } from './useIngredientsTab';
import type { useVariantActions } from './useVariantActions';

export interface LayoutProps {
  state: ReturnType<typeof useIngredientsTab>;
  selectedRow: IngredientRow | null;
  variants: readonly IngredientVariantRow[];
  parentName: string | null;
  ingredientActions: ReturnType<typeof useIngredientActions>;
  variantActions: ReturnType<typeof useVariantActions>;
  focused: ReturnType<typeof useFocusedIngredient>;
  blockers: DeleteBlockerSummary | null;
  recipeRefCountForDelete: number;
  deleteRefsLoading: boolean;
}

export function IngredientsTabLayout(props: LayoutProps) {
  const { state, selectedRow, focused } = props;
  return (
    <div className="space-y-3">
      {focused.notFoundSlug !== null ? (
        <FocusNotFoundBanner slug={focused.notFoundSlug} onDismiss={focused.acknowledgeNotFound} />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <TreeColumn state={state} highlightedId={focused.highlightedId} />
        <DetailSection {...props} />
      </div>
      <CreateIngredientDialog
        open={state.createDialogOpen}
        onOpenChange={(open) => (open ? state.openCreateDialog() : state.closeCreateDialog())}
        ingredients={state.flatIngredients}
        isSubmitting={state.isCreatingIngredient}
        errorMessage={state.createErrorMessage}
        onSubmit={state.submitCreate}
      />
      {selectedRow !== null ? (
        <IngredientTabDialogs
          ingredient={selectedRow}
          ingredients={state.flatIngredients}
          ingredientActions={props.ingredientActions}
          variantActions={props.variantActions}
          blockers={props.blockers}
          recipeRefCountForDelete={props.recipeRefCountForDelete}
          deleteRefsLoading={props.deleteRefsLoading}
        />
      ) : null}
    </div>
  );
}

function FocusNotFoundBanner({ slug, onDismiss }: { slug: string; onDismiss: () => void }) {
  const { t } = useTranslation('food');
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-2 rounded border border-amber-500/40 bg-amber-50 p-2 text-sm"
    >
      <span>{t('data.ingredients.focus.notFound', { slug })}</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDismiss}
        aria-label={t('data.ingredients.focus.dismiss')}
      >
        ✕
      </Button>
    </div>
  );
}

function TreeColumn({
  state,
  highlightedId,
}: {
  state: ReturnType<typeof useIngredientsTab>;
  highlightedId: number | null;
}) {
  const { t } = useTranslation('food');
  return (
    <section className="space-y-3" aria-label={t('data.ingredients.title')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          {t('data.ingredients.title')}
        </h2>
        <Button size="sm" onClick={state.openCreateDialog}>
          {t('data.ingredients.create.openButton')}
        </Button>
      </div>
      <IngredientsTree
        tree={state.tree}
        selectedId={state.selectedId}
        expandedIds={state.expandedIds}
        highlightedId={highlightedId}
        search={state.search}
        onSearchChange={state.setSearch}
        onSelect={state.selectIngredient}
        onToggle={state.toggleNode}
        isLoading={state.isLoadingList}
      />
    </section>
  );
}

function DetailSection(props: LayoutProps) {
  const { t } = useTranslation('food');
  const { state, selectedRow, variants, parentName, ingredientActions, variantActions } = props;
  const actionsBusy =
    ingredientActions.isRenaming ||
    ingredientActions.isChangingParent ||
    ingredientActions.isDeleting;
  return (
    <section aria-label={t('data.ingredients.detailAriaLabel')}>
      <DetailColumn
        selectedId={state.selectedId}
        isLoading={state.detail.isLoading}
        selectedRow={selectedRow}
        variants={variants}
        parentName={parentName}
        actions={{
          onRename: ingredientActions.openRename,
          onChangeParent: ingredientActions.openChangeParent,
          onDelete: ingredientActions.openDelete,
          isBusy: actionsBusy,
        }}
        variantsApi={{
          onAdd: variantActions.openCreate,
          onEdit: variantActions.openEdit,
          onDelete: variantActions.openDelete,
        }}
      />
    </section>
  );
}

interface DetailColumnProps {
  selectedId: number | null;
  isLoading: boolean;
  selectedRow: IngredientRow | null;
  variants: readonly IngredientVariantRow[];
  parentName: string | null;
  actions: {
    onRename: () => void;
    onChangeParent: () => void;
    onDelete: () => void;
    isBusy: boolean;
  };
  variantsApi: {
    onAdd: () => void;
    onEdit: (variant: IngredientVariantRow) => void;
    onDelete: (variant: IngredientVariantRow) => void;
  };
}

function DetailColumn(props: DetailColumnProps) {
  const { t } = useTranslation('food');
  if (props.selectedId === null) {
    return <p className="text-muted-foreground text-sm">{t('data.ingredients.selectionPrompt')}</p>;
  }
  if (props.isLoading) {
    return <p className="text-muted-foreground text-sm">{t('data.ingredients.loading')}</p>;
  }
  if (props.selectedRow === null) return null;
  return (
    <IngredientDetailPanel
      ingredient={props.selectedRow}
      variants={props.variants}
      parentName={props.parentName}
      actions={props.actions}
      variantsApi={props.variantsApi}
    />
  );
}
