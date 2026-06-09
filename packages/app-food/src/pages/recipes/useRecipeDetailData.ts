import { trpc } from '@pops/api-client';

import type { RecipeVersionWithCompiledData } from '@pops/app-food-db';

export interface RecipeDetailQueryArgs {
  slug: string;
  versionNo?: number;
}

export interface RecipeDetailState {
  data: RecipeVersionWithCompiledData | undefined;
  draftCount: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Combine the two reads PRD-119-B's detail page needs: the heavy compile
 * payload (via `food.recipes.getForRendering`) and the draft count (via
 * `food.recipes.listDrafts`). Drafts is keyed off the slug only so it
 * stays cached across version-no navigation.
 */
export function useRecipeDetailData({ slug, versionNo }: RecipeDetailQueryArgs): RecipeDetailState {
  const rendering = trpc.food.recipes.getForRendering.useQuery({ slug, versionNo });
  const drafts = trpc.food.recipes.listDrafts.useQuery({ slug });
  const error = firstError(rendering.error, drafts.error);
  return {
    data: rendering.data,
    draftCount: drafts.data?.drafts.length ?? 0,
    isLoading: rendering.isLoading,
    error,
    refetch: () => {
      void rendering.refetch();
      void drafts.refetch();
    },
  };
}

function firstError(a: unknown, b: unknown): Error | null {
  if (a instanceof Error) return a;
  if (b instanceof Error) return b;
  return null;
}
