/**
 * Ego conversation persistence service.
 *
 * Thin CRUD layer over the conversations, messages, and conversation_context
 * tables. All writes go through Drizzle ORM.
 */
import { and, desc, eq, like, sql } from 'drizzle-orm';

import { conversations, conversationContext, messages } from '@pops/db-types/schema';

import {
  autoTitle,
  generateConversationId,
  generateMessageId,
  toConversation,
  toMessage,
} from './types.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type {
  AppendMessageInput,
  Conversation,
  CreateConversationInput,
  ListConversationsInput,
  Message,
} from './types.js';

export type {
  AppendMessageInput,
  Conversation,
  CreateConversationInput,
  ListConversationsInput,
  Message,
} from './types.js';
export { autoTitle } from './types.js';

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

export interface ConversationPersistenceOptions {
  db: BetterSQLite3Database;
  now?: () => Date;
}

export class ConversationPersistence {
  private readonly db: BetterSQLite3Database;
  private readonly now: () => Date;

  constructor(options: ConversationPersistenceOptions) {
    this.db = options.db;
    this.now = options.now ?? (() => new Date());
  }

  /** Create a new conversation. */
  createConversation(input: CreateConversationInput): Conversation {
    const now = this.now();
    const id = generateConversationId(now);
    const iso = now.toISOString();
    const row: ConversationRow = {
      id,
      title: input.title ?? null,
      activeScopes: JSON.stringify(input.scopes ?? []),
      appContext: input.appContext !== undefined ? JSON.stringify(input.appContext) : null,
      model: input.model,
      createdAt: iso,
      updatedAt: iso,
    };
    this.db.insert(conversations).values(row).run();
    return toConversation(row);
  }

  /** List conversations with optional pagination and title search. */
  listConversations(input: ListConversationsInput = {}): {
    conversations: Conversation[];
    total: number;
  } {
    const { limit = 50, offset = 0, search } = input;
    const where = search ? like(conversations.title, `%${search}%`) : undefined;
    const totalResult = this.db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(where)
      .get();
    const rows = this.db
      .select()
      .from(conversations)
      .where(where)
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .offset(offset)
      .all();
    return { conversations: rows.map(toConversation), total: totalResult?.count ?? 0 };
  }

  /** Get a conversation with all its messages. */
  getConversation(id: string): { conversation: Conversation; messages: Message[] } | null {
    const row = this.db.select().from(conversations).where(eq(conversations.id, id)).get();
    if (!row) return null;
    const msgRows = this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt)
      .all();
    return { conversation: toConversation(row), messages: msgRows.map(toMessage) };
  }

  /** Delete a conversation and cascade to messages + context. */
  deleteConversation(id: string): void {
    this.db.transaction((tx) => {
      tx.delete(conversationContext).where(eq(conversationContext.conversationId, id)).run();
      tx.delete(messages).where(eq(messages.conversationId, id)).run();
      tx.delete(conversations).where(eq(conversations.id, id)).run();
    });
  }

  /**
   * Append a message to a conversation. Updates conversation.updatedAt.
   * Auto-generates a title from the first user message when none is set.
   */
  appendMessage(conversationId: string, input: AppendMessageInput): Message {
    const now = this.now();
    const id = generateMessageId(now);
    const iso = now.toISOString();
    const row: MessageRow = {
      id,
      conversationId,
      role: input.role,
      content: input.content,
      citations: input.citations ? JSON.stringify(input.citations) : null,
      toolCalls: input.toolCalls ? JSON.stringify(input.toolCalls) : null,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
      createdAt: iso,
    };
    this.db.insert(messages).values(row).run();
    this.db
      .update(conversations)
      .set({ updatedAt: iso })
      .where(eq(conversations.id, conversationId))
      .run();
    this.maybeAutoTitle(conversationId, input);
    return toMessage(row);
  }

  /** Insert or update a context entry linking a conversation to an engram. */
  upsertContext(conversationId: string, engramId: string, relevanceScore?: number): void {
    const iso = this.now().toISOString();
    this.db
      .insert(conversationContext)
      .values({ conversationId, engramId, relevanceScore: relevanceScore ?? null, loadedAt: iso })
      .onConflictDoUpdate({
        target: [conversationContext.conversationId, conversationContext.engramId],
        set: { relevanceScore: relevanceScore ?? null, loadedAt: iso },
      })
      .run();
  }

  /** Update the conversation title. */
  updateTitle(conversationId: string, title: string): void {
    this.db
      .update(conversations)
      .set({ title, updatedAt: this.now().toISOString() })
      .where(eq(conversations.id, conversationId))
      .run();
  }

  /** Replace the conversation's active scopes. */
  updateScopes(conversationId: string, scopes: string[]): void {
    this.db
      .update(conversations)
      .set({ activeScopes: JSON.stringify(scopes), updatedAt: this.now().toISOString() })
      .where(eq(conversations.id, conversationId))
      .run();
  }

  /** Update the conversation's app context (US-03). */
  updateAppContext(conversationId: string, appContext: unknown): void {
    this.db
      .update(conversations)
      .set({
        appContext: appContext != null ? JSON.stringify(appContext) : null,
        updatedAt: this.now().toISOString(),
      })
      .where(eq(conversations.id, conversationId))
      .run();
  }

  /** Get all context entries (engram associations) for a conversation (US-03). */
  getContextEntries(
    conversationId: string
  ): Array<{ engramId: string; relevanceScore: number | null; loadedAt: string }> {
    return this.db
      .select({
        engramId: conversationContext.engramId,
        relevanceScore: conversationContext.relevanceScore,
        loadedAt: conversationContext.loadedAt,
      })
      .from(conversationContext)
      .where(eq(conversationContext.conversationId, conversationId))
      .orderBy(desc(conversationContext.loadedAt))
      .all();
  }

  /** Auto-generate title from first user message when no title is set. */
  private maybeAutoTitle(conversationId: string, input: AppendMessageInput): void {
    if (input.role !== 'user') return;
    const conv = this.db
      .select({ title: conversations.title })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .get();
    if (!conv || conv.title) return;
    const msgCount = this.db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'user')))
      .get();
    if (msgCount && msgCount.count === 1) {
      this.db
        .update(conversations)
        .set({ title: autoTitle(input.content) })
        .where(eq(conversations.id, conversationId))
        .run();
    }
  }
}
