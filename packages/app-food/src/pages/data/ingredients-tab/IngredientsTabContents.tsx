/**
 * Ingredients tab (PRD-122). Two-column layout: tree on the left,
 * detail panel on the right. Mobile collapses to single column (the
 * detail appears below the tree).
 */
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { CreateIngredientDialog } from './CreateIngredientDialog';
import { IngredientDetailPanel } from './IngredientDetailPanel';
import { IngredientsTree } from './IngredientsTree';
import { useIngredientsTab } from './useIngredientsTab';

import type { IngredientRow, IngredientVariantRow } from '@pops/app-food-db';

function findParentRow(
  selectedRow: IngredientRow | null,
  rows: readonly IngredientRow[]
): IngredientRow | null {
  if (selectedRow === null || selectedRow.parentId === null) return null;
  return rows.find((row) => row.id === selectedRow.parentId) ?? null;
}

interface DetailColumnProps {
  selectedId: number | null;
  isLoading: boolean;
  selectedRow: IngredientRow | null;
  variants: readonly IngredientVariantRow[];
  parentName: string | null;
}

function DetailColumn({
  selectedId,
  isLoading,
  selectedRow,
  variants,
  parentName,
}: DetailColumnProps) {
  const { t } = useTranslation('food');
  if (selectedId === null) {
    return <p className="text-muted-foreground text-sm">{t('data.ingredients.selectionPrompt')}</p>;
  }
  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t('data.ingredients.loading')}</p>;
  }
  if (selectedRow === null) return null;
  return (
    <IngredientDetailPanel ingredient={selectedRow} variants={variants} parentName={parentName} />
  );
}

export function IngredientsTabContents() {
  const { t } = useTranslation('food');
  const state = useIngredientsTab();

  const selectedRow = state.detail.data?.ingredient ?? null;
  const variants = state.detail.data?.variants ?? [];
  const parentRow = findParentRow(selectedRow, state.flatIngredients);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
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
          search={state.search}
          onSearchChange={state.setSearch}
          onSelect={state.selectIngredient}
          onToggle={state.toggleNode}
          isLoading={state.isLoadingList}
        />
      </section>

      <section aria-label={t('data.ingredients.detailAriaLabel')}>
        <DetailColumn
          selectedId={state.selectedId}
          isLoading={state.detail.isLoading}
          selectedRow={selectedRow}
          variants={variants}
          parentName={parentRow?.name ?? null}
        />
      </section>

      <CreateIngredientDialog
        open={state.createDialogOpen}
        onOpenChange={(open) => (open ? state.openCreateDialog() : state.closeCreateDialog())}
        ingredients={state.flatIngredients}
        isSubmitting={state.isCreatingIngredient}
        errorMessage={state.createErrorMessage}
        onSubmit={state.submitCreate}
      />
    </div>
  );
}
