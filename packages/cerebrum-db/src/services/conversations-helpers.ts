/**
 * Conversation row serialisation helpers.
 *
 * Extracted so the SQL seam in `conversations.ts` stays focused on
 * queries and so tests can exercise the JSON deserialisation logic in
 * isolation. `active_scopes` is stored as a JSON-encoded `string[]`;
 * `app_context`, `citations`, and `tool_calls` are stored as
 * JSON-encoded opaque values (the chat orchestration layer owns the
 * shape) and round-tripped as `unknown` here.
 */
import type { conversationContext, conversations, messages } from '../schema.js';
import type {
  Conversation,
  ConversationContextEntry,
  Message,
  MessageRole,
} from './conversations-types.js';

/** Deserialise a row from `conversations` into a `Conversation`. */
export function rowToConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    title: row.title,
    activeScopes: parseScopes(row.activeScopes),
    appContext: parseJsonOrNull(row.appContext),
    model: row.model,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Deserialise a row from `messages` into a `Message`. */
export function rowToMessage(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    content: row.content,
    citations: parseJsonOrNull(row.citations),
    toolCalls: parseJsonOrNull(row.toolCalls),
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    createdAt: row.createdAt,
  };
}

/** Deserialise a row from `conversation_context`. */
export function rowToContextEntry(
  row: typeof conversationContext.$inferSelect
): ConversationContextEntry {
  return {
    conversationId: row.conversationId,
    engramId: row.engramId,
    relevanceScore: row.relevanceScore,
    loadedAt: row.loadedAt,
  };
}

function parseScopes(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((s): s is string => typeof s === 'string');
}

function parseJsonOrNull(value: string | null): unknown | null {
  if (value == null) return null;
  return JSON.parse(value) as unknown;
}
