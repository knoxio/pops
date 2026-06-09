/**
 * Detail-panel queries kept out of `IngredientsTabContents` so the page
 * component stays under the lint complexity + length caps. Both queries
 * are gated on the delete dialog being open so the API isn't hit until
 * the user is about to delete.
 */
import { trpc } from '@pops/api-client';

import type { IngredientRow } from '@pops/app-food-db';

interface BlockerQueryArgs {
  ingredient: IngredientRow | null;
  deleteOpen: boolean;
}

export function useBlockersQuery({ ingredient, deleteOpen }: BlockerQueryArgs) {
  return trpc.food.ingredients.blockers.useQuery(
    { id: ingredient?.id ?? 0 },
    { enabled: ingredient !== null && deleteOpen }
  );
}

export function useRecipeRefCount(ingredientId: number | null, deleteOpen: boolean): number {
  const query = trpc.food.ingredients.recipeRefs.useQuery(
    { id: ingredientId ?? 0 },
    { enabled: ingredientId !== null && deleteOpen }
  );
  return query.data?.count ?? 0;
}
