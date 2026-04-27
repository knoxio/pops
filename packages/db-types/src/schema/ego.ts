/**
 * Ego conversation persistence schema.
 *
 * Stores conversation history, messages, and context associations
 * for the Ego AI assistant. Conversations reference engrams via the
 * conversationContext junction table.
 */
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    activeScopes: text('active_scopes').notNull(),
    appContext: text('app_context'),
    model: text('model').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_conversations_created_at').on(table.createdAt),
    index('idx_conversations_updated_at').on(table.updatedAt),
  ]
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    citations: text('citations'),
    toolCalls: text('tool_calls'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_messages_conversation_created').on(table.conversationId, table.createdAt)]
);

export const conversationContext = sqliteTable(
  'conversation_context',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    engramId: text('engram_id').notNull(),
    relevanceScore: real('relevance_score'),
    loadedAt: text('loaded_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.engramId] }),
    index('idx_conversation_context_conversation').on(table.conversationId),
    index('idx_conversation_context_engram').on(table.engramId),
  ]
);
