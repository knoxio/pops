/**
 * Two-column layout: tree on the left, detail panel on the right. Mobile
 * collapses to single column (detail appears below the tree).
 *
 * Orchestrates the detail panel's CRUD dialogs (rename / change-parent /
 * delete + variant create/edit/delete) and the `?focus=<slug>` deep-link
 * scroll + 2 s highlight. The actual layout JSX lives in
 * `IngredientsTabLayout.tsx`; this component composes the data hooks
 * and hands the assembled props through.
 */
import { useCallback } from 'react';

import { useBlockersQuery, useRecipeRefCount } from './ingredient-tab-queries';
import { IngredientsTabLayout } from './IngredientsTabLayout';
import { useFocusedIngredient } from './useFocusedIngredient';
import { useIngredientActions } from './useIngredientActions';
import { useIngredientsTab } from './useIngredientsTab';
import { useVariantActions } from './useVariantActions';

import type { IngredientRow } from './ingredient-wire-types.js';

function findParentRow(
  selectedRow: IngredientRow | null,
  rows: readonly IngredientRow[]
): IngredientRow | null {
  if (selectedRow === null || selectedRow.parentId === null) return null;
  return rows.find((row) => row.id === selectedRow.parentId) ?? null;
}

function useIngredientFocus(state: ReturnType<typeof useIngredientsTab>) {
  const onResolved = useCallback((id: number) => state.selectIngredient(id), [state]);
  const onExpandAncestors = useCallback((ids: readonly number[]) => state.expandMany(ids), [state]);
  return useFocusedIngredient({
    ingredients: state.flatIngredients,
    isListLoading: state.isLoadingList,
    onResolved,
    onExpandAncestors,
  });
}

function getSelectedRow(state: ReturnType<typeof useIngredientsTab>): IngredientRow | null {
  const data = state.detail.data;
  return data === undefined ? null : data.ingredient;
}

export function IngredientsTabContents() {
  const state = useIngredientsTab();
  const selectedRow = getSelectedRow(state);
  const ingredientActions = useIngredientActions(selectedRow === null ? null : selectedRow.id);
  const variantActions = useVariantActions(selectedRow === null ? null : selectedRow.id);
  const blockers = useBlockersQuery({
    ingredient: selectedRow,
    deleteOpen: ingredientActions.open.delete,
  });
  const recipeRefs = useRecipeRefCount(
    selectedRow === null ? null : selectedRow.id,
    ingredientActions.open.delete
  );
  const focused = useIngredientFocus(state);
  const variants = state.detail.data === undefined ? [] : state.detail.data.variants;
  const parentRow = findParentRow(selectedRow, state.flatIngredients);
  return (
    <IngredientsTabLayout
      state={state}
      selectedRow={selectedRow}
      variants={variants}
      parentName={parentRow === null ? null : parentRow.name}
      ingredientActions={ingredientActions}
      variantActions={variantActions}
      focused={focused}
      blockers={blockers.data}
      recipeRefCountForDelete={recipeRefs.count}
      deleteRefsLoading={blockers.isLoading || recipeRefs.isLoading}
    />
  );
}
