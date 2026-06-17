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
import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../../food-api-helpers.js';
import { ingredientsBlockers, ingredientsRecipeRefs } from '../../../food-api/index.js';

import type { DeleteBlockerSummary, IngredientRow } from '@pops/app-food-db';

interface BlockerQueryArgs {
  ingredient: IngredientRow | null;
  deleteOpen: boolean;
}

export interface BlockersState {
  data: DeleteBlockerSummary | null;
  isLoading: boolean;
}

export function useBlockersQuery({ ingredient, deleteOpen }: BlockerQueryArgs): BlockersState {
  const id = ingredient?.id ?? 0;
  const query = useQuery({
    queryKey: ['food', 'ingredients', 'blockers', id],
    queryFn: async () => unwrap(await ingredientsBlockers({ path: { id } })).data,
    enabled: ingredient !== null && deleteOpen,
  });
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
  const id = ingredientId ?? 0;
  const query = useQuery({
    queryKey: ['food', 'ingredients', 'recipeRefs', id],
    queryFn: async () => unwrap(await ingredientsRecipeRefs({ path: { id } })),
    enabled: ingredientId !== null && deleteOpen,
  });
  return {
    count: query.data?.count ?? 0,
    isLoading: ingredientId !== null && deleteOpen && query.data === undefined,
  };
}
