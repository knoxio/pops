/**
 * Combined data hook for the send-to-list modal
 * (pillars/food/docs/prds/send-to-list).
 *
 * Fetches the preview (`sendToListPrepare`, food REST client) and the
 * available shopping lists (`listListAggregate`, lists REST client) in
 * parallel; the modal renders once both resolve. Both queries are scoped to
 * `enabled=open` so the modal pays nothing while closed.
 *
 * The shopping-list read is a cross-pillar call to the lists pillar through
 * food's generated lists client.
 */
import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../../food-api-helpers.js';
import { sendToListPrepare } from '../../../food-api/index.js';
import { unwrapLists } from '../../../lists-api-helpers.js';
import { listListAggregate } from '../../../lists-api/index.js';

import type { SendToListPrepareResponses } from '../../../food-api/types.gen.js';
import type {
  ListListAggregateData,
  ListListAggregateResponses,
} from '../../../lists-api/types.gen.js';

export type PrepareOutput = SendToListPrepareResponses[200];
export type ShoppingList = ListListAggregateResponses[200]['items'][number];

const LISTS_QUERY: NonNullable<ListListAggregateData['query']> = {
  kinds: ['shopping'],
  includeArchived: false,
  sort: 'updated',
};

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
  const lists = useQuery({
    queryKey: ['lists', 'list', 'listAggregate', LISTS_QUERY],
    queryFn: async () => unwrapLists(await listListAggregate({ query: LISTS_QUERY })),
    enabled,
  });
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
