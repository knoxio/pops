/**
 * Sub-hook: chat and delete mutations.
 */
import { useCallback, useState } from 'react';

import { trpc } from '@pops/api-client';

import type { ChatMessage, RetrievedEngram } from './types';

/** Shape returned by the ego.chat mutation. */
interface ChatResponse {
  conversationId: string;
  response: ChatMessage;
  retrievedEngrams: RetrievedEngram[];
}

/** Shape of the ego.conversations.delete mutation input. */
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

  const chatMutation = trpc.ego.chat.useMutation({
    onSuccess: (data: ChatResponse) => {
      setSelectedConversationId(data.conversationId);
      setRetrievedEngrams(data.retrievedEngrams);
      void utils.ego.conversations.list.invalidate();
      void utils.ego.conversations.get.invalidate({ id: data.conversationId });
    },
  });

  const sendMessage = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setInputValue('');
    chatMutation.mutate({
      conversationId: selectedConversationId ?? undefined,
      message: trimmed,
    });
  }, [inputValue, selectedConversationId, chatMutation, setInputValue]);

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
    isSending: chatMutation.isPending,
    sendError: chatMutation.error?.message ?? null,
    deleteConversation,
    isDeleting: deleteMutation.isPending,
    retrievedEngrams,
    clearEngrams,
  };
}
