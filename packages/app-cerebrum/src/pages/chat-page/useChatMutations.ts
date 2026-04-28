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

interface DeleteInput {
  id: string;
}

interface UseChatMutationsParams {
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
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

  const sendMessage = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || streaming.isStreaming) return;

    setInputValue('');
    streaming.stream(
      { conversationId: selectedConversationId, message: trimmed },
      {
        onConversation: setSelectedConversationId,
        onEngrams: setRetrievedEngrams,
        onInvalidate: (conversationId) => {
          void utils.ego.conversations.list.invalidate();
          void utils.ego.conversations.get.invalidate({ id: conversationId });
        },
      }
    );
  }, [
    inputValue,
    selectedConversationId,
    streaming,
    setInputValue,
    setSelectedConversationId,
    utils,
  ]);

  const deleteMutation = trpc.ego.conversations.delete.useMutation({
    onSuccess: (_data: { success: boolean }, variables: DeleteInput) => {
      if (selectedConversationId === variables.id) {
        setSelectedConversationId(null);
        setRetrievedEngrams([]);
      }
      void utils.ego.conversations.list.invalidate();
    },
  });

  const deleteConversation = useCallback(
    (id: string) => deleteMutation.mutate({ id }),
    [deleteMutation]
  );

  const clearEngrams = useCallback(() => setRetrievedEngrams([]), []);

  return {
    sendMessage,
    isSending: streaming.isStreaming,
    sendError: streaming.error,
    deleteConversation,
    isDeleting: deleteMutation.isPending,
    retrievedEngrams,
    clearEngrams,
    streamingContent: streaming.streamingContent,
  };
}
