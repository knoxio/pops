/**
 * Sub-hook: selected conversation detail (messages + metadata).
 */
import { useMemo } from 'react';

import { trpc } from '@pops/api-client';

import type { ChatMessage } from './types';

/** Shape returned by ego.conversations.get — conversation record. */
interface ConversationRecord {
  activeScopes: string[];
}

/** Shape returned by ego.conversations.get — message record. */
interface MessageRecord {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  citations: string[] | null;
  createdAt: string;
}

export function useConversationDetail(conversationId: string | null) {
  const query = trpc.ego.conversations.get.useQuery(
    { id: conversationId ?? '' },
    { enabled: conversationId !== null, staleTime: 10_000 }
  );

  const messages: ChatMessage[] = useMemo(
    () =>
      ((query.data?.messages as MessageRecord[] | undefined) ?? []).map((m: MessageRecord) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        citations: m.citations,
        createdAt: m.createdAt,
      })),
    [query.data]
  );

  const activeScopes: string[] = useMemo(
    () => (query.data?.conversation as ConversationRecord | undefined)?.activeScopes ?? [],
    [query.data]
  );

  return { messages, activeScopes, isLoading: query.isLoading };
}
