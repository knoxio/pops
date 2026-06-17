/**
 * Sub-hook: conversation list data and search.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { egoListConversations } from '../ego-api';
import { unwrap } from '../ego-api-helpers';

import type { ConversationSummary } from './types';

export function useConversationList() {
  const [searchQuery, setSearchQuery] = useState('');

  const body = { search: searchQuery || undefined };
  const query = useQuery({
    queryKey: ['ego', 'conversations', 'list', body],
    queryFn: async () => unwrap(await egoListConversations({ body })),
    staleTime: 30_000,
  });

  const conversations: ConversationSummary[] = useMemo(
    () =>
      (query.data?.conversations ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
      })),
    [query.data]
  );

  return {
    conversations,
    isLoading: query.isLoading,
    searchQuery,
    setSearchQuery,
  };
}
