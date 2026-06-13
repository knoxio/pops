/**
 * Detail-panel queries kept out of `IngredientsTabContents` so the page
 * component stays under the lint complexity + length caps. Both queries
 * are gated on the delete dialog being open so the API isn't hit until
 * the user is about to delete.
 *
 * Both helpers expose `isLoading` so the delete confirm button can stay
 * disabled until the counts have actually resolved — otherwise a `0`
 * default during the in-flight window would temporarily enable the
 * destructive action and surface a confusing FK-CONFLICT path.
 */
import { usePillarQuery } from '@pops/pillar-sdk/react';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';
import type { DeleteBlockerSummary, IngredientRow } from '@pops/app-food-db';

type BlockersOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['blockers'];
type RecipeRefsOutput = inferRouterOutputs<AppRouter>['food']['ingredients']['recipeRefs'];

interface BlockerQueryArgs {
  ingredient: IngredientRow | null;
  deleteOpen: boolean;
}

export interface BlockersState {
  data: DeleteBlockerSummary | null;
  isLoading: boolean;
}

export function useBlockersQuery({ ingredient, deleteOpen }: BlockerQueryArgs): BlockersState {
  const query = usePillarQuery<BlockersOutput>(
    'food',
    ['ingredients', 'blockers'],
    { id: ingredient?.id ?? 0 },
    { enabled: ingredient !== null && deleteOpen }
  );
  return {
    data: query.data ?? null,
    isLoading: ingredient !== null && deleteOpen && query.data === undefined,
  };
}

export interface RecipeRefCountState {
  count: number;
  isLoading: boolean;
}

export function useRecipeRefCount(
  ingredientId: number | null,
  deleteOpen: boolean
): RecipeRefCountState {
  const query = usePillarQuery<RecipeRefsOutput>(
    'food',
    ['ingredients', 'recipeRefs'],
    { id: ingredientId ?? 0 },
    { enabled: ingredientId !== null && deleteOpen }
  );
  return {
    count: query.data?.count ?? 0,
    isLoading: ingredientId !== null && deleteOpen && query.data === undefined,
  };
}
