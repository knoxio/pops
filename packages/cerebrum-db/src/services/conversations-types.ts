/**
 * Conversations public shapes returned from the data-access layer.
 *
 * Mirrors the conversation / message / context shapes the pops-api
 * `ConversationPersistence` exposes today. Kept in the data package so
 * `cerebrum-api` and any other consumer can build views without
 * re-deriving them from drizzle row shapes.
 */

/** Message roles allowed in the chat stream. */
export const MESSAGE_ROLES = ['user', 'assistant', 'system', 'tool'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** A conversation row deserialised from `conversations`. */
export interface Conversation {
  id: string;
  title: string | null;
  activeScopes: string[];
  appContext: unknown | null;
  model: string;
  createdAt: string;
  updatedAt: string;
}

/** A message row deserialised from `messages`. */
export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  citations: unknown | null;
  toolCalls: unknown | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

/** A conversation context (engram association) row. */
export interface ConversationContextEntry {
  conversationId: string;
  engramId: string;
  relevanceScore: number | null;
  loadedAt: string;
}

/** Insert payload for `insertConversation`. */
export interface InsertConversationRow {
  id: string;
  title: string | null;
  activeScopes: readonly string[];
  appContext: unknown | null;
  model: string;
  createdAt: string;
  updatedAt: string;
}

/** Patch payload for `updateConversation` — every column optional. */
export interface UpdateConversationPatch {
  title?: string | null;
  activeScopes?: readonly string[];
  appContext?: unknown | null;
  updatedAt: string;
}

/** Insert payload for `insertMessage`. */
export interface InsertMessageRow {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  citations: unknown | null;
  toolCalls: unknown | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

/** Upsert payload for `upsertConversationContext`. */
export interface UpsertContextRow {
  conversationId: string;
  engramId: string;
  relevanceScore: number | null;
  loadedAt: string;
}

/** Filters for `listConversations`. */
export interface ConversationListFilters {
  search?: string;
  limit?: number;
  offset?: number;
}

/** Result envelope from `listConversations`. */
export interface ListConversationsResult {
  conversations: Conversation[];
  total: number;
}
