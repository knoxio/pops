/**
 * ChatPanel — main chat panel component.
 *
 * Composes ConversationList, MessageThread, ChatInput, and ContextIndicator
 * into a two-column layout (sidebar + thread) for the chat page.
 */
import { MessageSquare } from 'lucide-react';

import { EmptyState, cn } from '@pops/ui';

import { ChatInput } from './ChatInput';
import { ContextIndicator } from './ContextIndicator';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';

import type { ChatPageModel } from '../../pages/chat-page/types';

export interface ChatPanelProps {
  /** The chat page view model. */
  model: ChatPageModel;
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
}

export function ChatPanel({ model, className }: ChatPanelProps) {
  return (
    <div
      className={cn('flex h-full overflow-hidden rounded-lg border border-border/50', className)}
    >
      {/* Sidebar */}
      <div className="w-72 shrink-0 border-r border-border/50 bg-card">
        <ConversationList
          conversations={model.conversations}
          isLoading={model.conversationsLoading}
          selectedId={model.selectedConversationId}
          onSelect={model.selectConversation}
          onNew={model.startNewConversation}
          onDelete={model.deleteConversation}
          isDeleting={model.isDeleting}
          searchQuery={model.searchQuery}
          onSearchChange={model.setSearchQuery}
        />
      </div>

      {/* Main thread area */}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {model.selectedConversationId === null && model.messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Start a conversation"
              description="Send a message to begin chatting with Ego, or select an existing conversation from the sidebar."
              size="lg"
            />
          </div>
        ) : (
          <MessageThread
            messages={model.messages}
            isLoading={model.messagesLoading}
            isSending={model.isSending}
          />
        )}

        {/* Context indicator + error */}
        <div className="space-y-2 px-4">
          <ContextIndicator
            activeScopes={model.activeScopes}
            contextEngrams={model.retrievedEngrams}
          />
          {model.sendError && (
            <div
              className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {model.sendError}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border/50 p-4">
          <ChatInput
            value={model.inputValue}
            onChange={model.setInputValue}
            onSend={model.sendMessage}
            isSending={model.isSending}
          />
        </div>
      </div>
    </div>
  );
}
