/**
 * Sub-hook: selected conversation detail (messages + metadata).
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { egoGetConversation } from '../ego-api';
import { unwrap } from '../ego-api-helpers';

import type { ChatMessage } from './types';

function toCitations(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((v): v is string => typeof v === 'string');
}

export function useConversationDetail(conversationId: string | null) {
  const query = useQuery({
    queryKey: ['ego', 'conversations', 'get', { id: conversationId }],
    queryFn: async () => unwrap(await egoGetConversation({ path: { id: conversationId ?? '' } })),
    enabled: conversationId !== null,
    staleTime: 10_000,
  });

  const messages: ChatMessage[] = useMemo(
    () =>
      (query.data?.messages ?? []).map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        citations: toCitations(m.citations),
        createdAt: m.createdAt,
      })),
    [query.data]
  );

  const activeScopes: string[] = useMemo(
    () => query.data?.conversation.activeScopes ?? [],
    [query.data]
  );

  return { messages, activeScopes, isLoading: query.isLoading };
}
