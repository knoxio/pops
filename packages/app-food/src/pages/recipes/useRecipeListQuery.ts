import { useMemo } from 'react';

import { usePillarInfiniteQuery } from '@pops/pillar-sdk/react';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

import type { RecipeListFilterState, RecipeType } from './recipe-list-types.js';

type RecipeListOutput = inferRouterOutputs<AppRouter>['food']['recipes']['list'];
type RecipeListCursor = string | null;

export interface UseRecipeListQueryArgs {
  filters: RecipeListFilterState;
  debouncedSearch: string;
}

export interface RecipeListItemView {
  slug: string;
  title: string | null;
  recipeType: RecipeType;
  heroImagePath: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  servings: number | null;
  tags: string[];
  hasCurrentVersion: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface UseRecipeListQueryResult {
  items: RecipeListItemView[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  error: Error | null;
  refetch: () => void;
}

/**
 * Wraps `food.recipes.list` paginated reads via `usePillarInfiniteQuery`
 * so the page component stays declarative. The hook is keyed off the
 * filter state plus a pre-debounced search string — the caller owns
 * debouncing so this hook doesn't re-trigger on every keystroke.
 */
export function useRecipeListQuery({
  filters,
  debouncedSearch,
}: UseRecipeListQueryArgs): UseRecipeListQueryResult {
  const input = useMemo(
    () => ({
      search: debouncedSearch.length === 0 ? undefined : debouncedSearch,
      recipeTypes: filters.recipeTypes.length === 0 ? undefined : filters.recipeTypes,
      tags: filters.tags.length === 0 ? undefined : filters.tags,
      includeArchived: filters.includeArchived,
      includeDraftOnly: filters.includeDraftOnly,
      sort: filters.sort,
    }),
    [debouncedSearch, filters]
  );

  const query = usePillarInfiniteQuery<RecipeListOutput, RecipeListCursor>(
    'food',
    ['recipes', 'list'],
    input,
    {
      initialPageParam: null as RecipeListCursor,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }
  );

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.items),
    [query.data]
  );

  return {
    items,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    error: query.error instanceof Error ? query.error : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
