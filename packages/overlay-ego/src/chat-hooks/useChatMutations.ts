/**
 * Sub-hook: chat mutations (SSE streaming) and delete.
 *
 * The streaming path uses the SSE endpoint for token-by-token rendering.
 * The non-streaming tRPC ego.chat mutation remains for MCP/CLI channels.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { egoDeleteConversation } from '../ego-api';
import { unwrap } from '../ego-api-helpers';
import { useStreamingChat } from './useStreamingChat';

import type { EgoGetConversationResponses } from '../ego-api/types.gen';
import type { RetrievedEngram } from './types';

type ConversationDetail = EgoGetConversationResponses[200];

interface UseChatMutationsParams {
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
}

function buildOptimisticMessage(conversationId: string, content: string) {
  return {
    id: `optimistic_${Date.now()}`,
    conversationId,
    role: 'user',
    content,
    citations: null,
    toolCalls: null,
    tokensIn: null,
    tokensOut: null,
    createdAt: new Date().toISOString(),
  };
}

function useDeleteConversation(
  selectedConversationId: string | null,
  setSelectedConversationId: (id: string | null) => void,
  setRetrievedEngrams: (e: RetrievedEngram[]) => void,
  queryClient: QueryClient
) {
  const mutation = useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      unwrap(await egoDeleteConversation({ path: { id } })),
    onSuccess: (_data, variables) => {
      if (selectedConversationId === variables.id) {
        setSelectedConversationId(null);
        setRetrievedEngrams([]);
      }
      void queryClient.invalidateQueries({ queryKey: ['ego', 'conversations', 'list'] });
    },
  });
  const deleteConversation = useCallback((id: string) => mutation.mutate({ id }), [mutation]);
  return { deleteConversation, isDeleting: mutation.isPending };
}

export function useChatMutations({
  selectedConversationId,
  setSelectedConversationId,
  inputValue,
  setInputValue,
}: UseChatMutationsParams) {
  const [retrievedEngrams, setRetrievedEngrams] = useState<RetrievedEngram[]>([]);
  const queryClient = useQueryClient();
  const streaming = useStreamingChat();
  const { deleteConversation, isDeleting } = useDeleteConversation(
    selectedConversationId,
    setSelectedConversationId,
    setRetrievedEngrams,
    queryClient
  );

  const sendMessage = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || streaming.isStreaming) return;
    setInputValue('');
    if (selectedConversationId) {
      const msg = buildOptimisticMessage(selectedConversationId, trimmed);
      queryClient.setQueryData<ConversationDetail>(
        ['ego', 'conversations', 'get', { id: selectedConversationId }],
        (prev) => (prev ? { ...prev, messages: [...prev.messages, msg] } : prev)
      );
    }
    streaming.stream(
      { conversationId: selectedConversationId, message: trimmed },
      {
        onConversation: setSelectedConversationId,
        onEngrams: setRetrievedEngrams,
        onInvalidate: (conversationId) => {
          void queryClient.invalidateQueries({ queryKey: ['ego', 'conversations', 'list'] });
          void queryClient.invalidateQueries({
            queryKey: ['ego', 'conversations', 'get', { id: conversationId }],
          });
        },
      }
    );
  }, [inputValue, selectedConversationId, streaming, setInputValue, setSelectedConversationId, queryClient]); // prettier-ignore

  const clearEngrams = useCallback(() => setRetrievedEngrams([]), []);

  return {
    sendMessage,
    isSending: streaming.isStreaming,
    sendError: streaming.error,
    deleteConversation,
    isDeleting,
    retrievedEngrams,
    clearEngrams,
    streamingContent: streaming.streamingContent,
  };
}
