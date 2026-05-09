/**
 * Types for the chat page view model and components.
 */

/** A conversation summary as displayed in the sidebar list. */
export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

/** A message in the conversation thread. */
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  citations: string[] | null;
  createdAt: string;
}

/** An engram loaded as context for the current conversation. */
export interface RetrievedEngram {
  engramId: string;
  relevanceScore: number;
}

/** The public interface exposed by useChatPageModel. */
export interface ChatPageModel {
  /** List of all conversations for the sidebar. */
  conversations: ConversationSummary[];
  /** Whether the conversation list is loading. */
  conversationsLoading: boolean;
  /** Currently selected conversation ID. */
  selectedConversationId: string | null;
  /** Select a conversation by ID. */
  selectConversation: (id: string) => void;
  /** Messages for the selected conversation. */
  messages: ChatMessage[];
  /** Whether messages are loading. */
  messagesLoading: boolean;
  /** Current input text. */
  inputValue: string;
  /** Update the current input text. */
  setInputValue: (value: string) => void;
  /** Send the current message. */
  sendMessage: () => void;
  /** Whether a message is currently being sent. */
  isSending: boolean;
  /** Error from the last send attempt. */
  sendError: string | null;
  /** Start a new conversation (clears selection). */
  startNewConversation: () => void;
  /** Delete a conversation by ID. */
  deleteConversation: (id: string) => void;
  /** Whether a delete is in progress. */
  isDeleting: boolean;
  /** Search/filter text for conversation list. */
  searchQuery: string;
  /** Update the search query. */
  setSearchQuery: (query: string) => void;
  /** Active scopes for the selected conversation. */
  activeScopes: string[];
  /** Retrieved engrams for the current conversation context. */
  retrievedEngrams: RetrievedEngram[];
  /** Partial streaming content being received (null when not streaming). */
  streamingContent: string | null;
}
