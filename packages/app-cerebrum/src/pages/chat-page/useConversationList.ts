/**
 * Sub-hook: conversation list data and search.
 */
import { useMemo, useState } from 'react';

import { trpc } from '@pops/api-client';

import type { ConversationSummary } from './types';

/** Shape returned by ego.conversations.list query. */
interface ConversationListItem {
  id: string;
  title: string | null;
  activeScopes: string[];
  appContext: unknown;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export function useConversationList() {
  const [searchQuery, setSearchQuery] = useState('');

  const query = trpc.ego.conversations.list.useQuery(
    { search: searchQuery || undefined },
    { staleTime: 30_000 }
  );

  const conversations: ConversationSummary[] = useMemo(
    () =>
      ((query.data?.conversations as ConversationListItem[] | undefined) ?? []).map(
        (c: ConversationListItem) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt,
        })
      ),
    [query.data]
  );

  return {
    conversations,
    isLoading: query.isLoading,
    searchQuery,
    setSearchQuery,
  };
}
