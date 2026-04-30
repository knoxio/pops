/**
 * Sub-hook: chat mutations (SSE streaming) and delete.
 *
 * The streaming path uses the SSE endpoint for token-by-token rendering.
 * The non-streaming tRPC ego.chat mutation remains for MCP/CLI channels.
 */
import { useCallback, useState } from 'react';

import { trpc } from '@pops/api-client';

import { useStreamingChat } from './useStreamingChat';

import type { RetrievedEngram } from './types';

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
  utils: ReturnType<typeof trpc.useUtils>
) {
  const mutation = trpc.ego.conversations.delete.useMutation({
    onSuccess: (_data: { success: boolean }, variables: { id: string }) => {
      if (selectedConversationId === variables.id) {
        setSelectedConversationId(null);
        setRetrievedEngrams([]);
      }
      void utils.ego.conversations.list.invalidate();
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
  const utils = trpc.useUtils();
  const streaming = useStreamingChat();
  const { deleteConversation, isDeleting } = useDeleteConversation(
    selectedConversationId,
    setSelectedConversationId,
    setRetrievedEngrams,
    utils
  );

  const sendMessage = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || streaming.isStreaming) return;
    setInputValue('');
    if (selectedConversationId) {
      const msg = buildOptimisticMessage(selectedConversationId, trimmed);
      utils.ego.conversations.get.setData(
        { id: selectedConversationId },
        (prev) => (prev ? { ...prev, messages: [...prev.messages, msg] } : prev),
      );
    }
    streaming.stream(
      { conversationId: selectedConversationId, message: trimmed },
      {
        onConversation: setSelectedConversationId,
        onEngrams: setRetrievedEngrams,
        onInvalidate: (conversationId) => {
          void utils.ego.conversations.list.invalidate();
          void utils.ego.conversations.get.invalidate({ id: conversationId });
        },
      },
    );
  }, [inputValue, selectedConversationId, streaming, setInputValue, setSelectedConversationId, utils]); // prettier-ignore

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
