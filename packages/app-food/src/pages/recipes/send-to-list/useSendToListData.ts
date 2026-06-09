/**
 * Combined data hook for the send-to-list modal — PRD-142.
 *
 * Fetches the preview (`food.recipes.prepareSendToList`) and the available
 * shopping lists (`lists.list.list`) in parallel; the modal renders once
 * both resolve. Both queries are scoped to enabled=open so the modal pays
 * nothing while closed.
 */
import { trpc } from '@pops/api-client';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

export type PrepareOutput = inferRouterOutputs<AppRouter>['food']['recipes']['prepareSendToList'];
export type ShoppingList = inferRouterOutputs<AppRouter>['lists']['list']['list']['items'][number];

export interface SendToListDataState {
  preview: PrepareOutput | undefined;
  shoppingLists: readonly ShoppingList[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface Args {
  versionId: number;
  scaleFactor: number;
  enabled: boolean;
}

export function useSendToListData({ versionId, scaleFactor, enabled }: Args): SendToListDataState {
  const prepare = trpc.food.recipes.prepareSendToList.useQuery(
    { versionId, scaleFactor },
    { enabled }
  );
  const lists = trpc.lists.list.list.useQuery(
    { kinds: ['shopping'], includeArchived: false, sort: 'updated' },
    { enabled }
  );
  return {
    preview: prepare.data,
    shoppingLists: lists.data?.items ?? [],
    isLoading: prepare.isLoading || lists.isLoading,
    error: (prepare.error as Error | null) ?? (lists.error as Error | null) ?? null,
    refetch: () => {
      void prepare.refetch();
      void lists.refetch();
    },
  };
}
