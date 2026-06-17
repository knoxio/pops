/**
 * Combined data hook for the send-to-list modal — PRD-142.
 *
 * Fetches the preview (`recipes.sendToList.prepare`) from the food SDK and
 * the available shopping lists (`lists.list.list`) in parallel; the modal
 * renders once both resolve. Both queries are scoped to enabled=open so the
 * modal pays nothing while closed.
 *
 * NOTE: the shopping-list read still goes through `usePillarQuery('lists',
 * …)`. `lists` is a separate pillar/SDK and app-food has no lists client,
 * so that cross-pillar call is out of scope for the food Hey API rewire.
 */
import { useQuery } from '@tanstack/react-query';

import { usePillarQuery } from '@pops/pillar-sdk/react';

import { unwrap } from '../../../food-api-helpers.js';
import { sendToListPrepare } from '../../../food-api/index.js';

import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api';

import type { SendToListPrepareResponses } from '../../../food-api/types.gen.js';

export type PrepareOutput = SendToListPrepareResponses[200];
type ListsListOutput = inferRouterOutputs<AppRouter>['lists']['list']['list'];
export type ShoppingList = ListsListOutput['items'][number];

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
  const prepare = useQuery({
    queryKey: ['food', 'recipes', 'sendToListPrepare', { versionId, scaleFactor }],
    queryFn: async () =>
      unwrap(await sendToListPrepare({ path: { versionId }, query: { scaleFactor } })),
    enabled,
  });
  const lists = usePillarQuery<ListsListOutput>(
    'lists',
    ['list', 'list'],
    { kinds: ['shopping'], includeArchived: false, sort: 'updated' },
    { enabled }
  );
  return {
    preview: prepare.data,
    shoppingLists: lists.data?.items ?? [],
    isLoading: prepare.isLoading || lists.isLoading,
    error: firstError(prepare.error, lists.error),
    refetch: () => {
      void prepare.refetch();
      void lists.refetch();
    },
  };
}

function firstError(a: unknown, b: unknown): Error | null {
  if (a instanceof Error) return a;
  if (b instanceof Error) return b;
  return null;
}
