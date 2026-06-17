import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../food-api-helpers.js';
import { recipesGetForRendering, recipesListDrafts } from '../../food-api/index.js';
import { asRenderingPayload } from './recipe-payloads.js';

import type { RecipeVersionWithCompiledData } from '../../components/recipe-render-types.js';

export interface RecipeDetailQueryArgs {
  slug: string;
  versionNo?: number;
  /**
   * Skip the `listDrafts` fetch when the caller doesn't need the count
   * (e.g. the historic-version page). Defaults to true so the detail page
   * keeps its action-menu badge.
   */
  includeDrafts?: boolean;
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
 * payload (via `recipes.getForRendering`) and the draft count (via
 * `recipes.listDrafts`). Drafts is keyed off the slug only so it
 * stays cached across version-no navigation, AND its fetch is gated by
 * `includeDrafts` so the historic-version page doesn't pay for a count
 * it never renders.
 */
export function useRecipeDetailData({
  slug,
  versionNo,
  includeDrafts = true,
}: RecipeDetailQueryArgs): RecipeDetailState {
  const rendering = useQuery({
    queryKey: ['food', 'recipes', 'getForRendering', { slug, versionNo }],
    queryFn: async () =>
      asRenderingPayload(
        unwrap(await recipesGetForRendering({ path: { slug }, query: { versionNo } }))
      ),
  });
  const drafts = useQuery({
    queryKey: ['food', 'recipes', 'listDrafts', { slug }],
    queryFn: async () => unwrap(await recipesListDrafts({ path: { slug } })),
    enabled: includeDrafts,
  });
  const error = firstError(rendering.error, drafts.error);
  return {
    data: rendering.data,
    draftCount: drafts.data?.drafts.length ?? 0,
    isLoading: rendering.isLoading,
    error,
    refetch: () => {
      void rendering.refetch();
      if (includeDrafts) void drafts.refetch();
    },
  };
}

function firstError(a: unknown, b: unknown): Error | null {
  if (a instanceof Error) return a;
  if (b instanceof Error) return b;
  return null;
}
