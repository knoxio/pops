/**
 * Ego conversation persistence service — read/write split during the
 * PRD-182 cutover.
 *
 * Thin CRUD layer over the `conversations`, `messages`, and
 * `conversation_context` tables. The class accepts two drizzle handles:
 *
 *  - `db` (BetterSQLite3Database) — the shared `pops.db` write handle.
 *    Every write path lands here: `createConversation`,
 *    `appendMessage` (plus the auto-title heuristic's read-after-write
 *    hop), `upsertContext`, `deleteConversation`, `updateTitle`,
 *    `updateScopes`, `updateAppContext`.
 *  - `readDb` (CerebrumDb) — the cerebrum pillar's `cerebrum.db` read
 *    handle. PRD-182 PR 2 routes pure user-facing reads through
 *    `@pops/cerebrum-db`'s `conversationsService` namespace against this
 *    handle: `listConversations`, `getConversation`,
 *    `getContextEntries`. `readDb` is optional and falls back to `db`
 *    so the existing in-memory test rigs (which inject a single SQLite
 *    handle for both stores) keep working without churn.
 *
 * Cross-store consistency relies on `backfillCerebrumFromShared()` in
 * `apps/pops-api/src/db/backfill-cerebrum-from-shared.ts`: a one-way,
 * boot-time copy from `pops.db` -> `cerebrum.db` that idempotently
 * fills missing rows on `conversations` + `messages` +
 * `conversation_context`. Between boots, newly-written rows live only
 * in `pops.db` until the next backfill, but read-after-write within the
 * same process is preserved because `maybeAutoTitle` (the only
 * post-write read) routes through `db`. Mirrors the read/write split
 * landed in PRD-179 PR 2 (engrams) and PRD-168 PR 2 (watch-history).
 *
 * PRD-182 PR 3 flips the writes too, at which point `db` collapses
 * into `readDb`. Heavy chat orchestration (LLM streaming, scope
 * negotiation, auto-title heuristic, persistence-store adapter) stays
 * in pops-api — `@pops/cerebrum-db` is pure data-access.
 */
import { and, eq, sql } from 'drizzle-orm';

import { conversationsService, type CerebrumDb } from '@pops/cerebrum-db';
import { conversations, conversationContext, messages } from '@pops/db-types/schema';

import { mapPackageConversation, mapPackageMessage } from './persistence-mappers.js';
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
  /**
   * Write handle — the shared `pops.db` drizzle wrapper. All write
   * paths and read-after-write hops (the auto-title heuristic in
   * particular) route through this handle until PRD-182 PR 3 flips the
   * writes too.
   */
  db: BetterSQLite3Database;
  /**
   * Read handle — the cerebrum pillar's `cerebrum.db` drizzle wrapper.
   * Pure user-facing reads (`listConversations`, `getConversation`,
   * `getContextEntries`) forward through `@pops/cerebrum-db`'s
   * `conversationsService` against this handle. Defaults to `db` so
   * test rigs that inject a single in-memory SQLite keep working
   * without churn.
   */
  readDb?: CerebrumDb;
  now?: () => Date;
}

export class ConversationPersistence {
  private readonly db: BetterSQLite3Database;
  private readonly readDb: CerebrumDb;
  private readonly now: () => Date;

  constructor(options: ConversationPersistenceOptions) {
    this.db = options.db;
    this.readDb = options.readDb ?? options.db;
    this.now = options.now ?? (() => new Date());
  }

  /** Create a new conversation. Writes to the shared `pops.db`. */
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

  /**
   * List conversations with optional pagination and title search.
   * Pure read — routed through `@pops/cerebrum-db`'s
   * `conversationsService.listConversations` against `readDb`.
   */
  listConversations(input: ListConversationsInput = {}): {
    conversations: Conversation[];
    total: number;
  } {
    const result = conversationsService.listConversations(this.readDb, {
      search: input.search,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    });
    return {
      conversations: result.conversations.map(mapPackageConversation),
      total: result.total,
    };
  }

  /**
   * Get a conversation with all its messages. Pure read — routed
   * through `@pops/cerebrum-db`'s
   * `conversationsService.{getConversation,listMessages}` against
   * `readDb`. Returns `null` when the conversation is missing.
   */
  getConversation(id: string): { conversation: Conversation; messages: Message[] } | null {
    const conv = conversationsService.getConversation(this.readDb, id);
    if (!conv) return null;
    const msgs = conversationsService.listMessages(this.readDb, id);
    return {
      conversation: mapPackageConversation(conv),
      messages: msgs.map(mapPackageMessage),
    };
  }

  /** Delete a conversation and cascade to messages + context. Writes to `pops.db`. */
  deleteConversation(id: string): void {
    this.db.transaction((tx) => {
      tx.delete(conversationContext).where(eq(conversationContext.conversationId, id)).run();
      tx.delete(messages).where(eq(messages.conversationId, id)).run();
      tx.delete(conversations).where(eq(conversations.id, id)).run();
    });
  }

  /**
   * Append a message to a conversation. Updates conversation.updatedAt.
   * Auto-generates a title from the first user message when none is
   * set. Writes (and the auto-title read-after-write hop) land on
   * `pops.db`.
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

  /**
   * Insert or update a context entry linking a conversation to an engram.
   * Writes to `pops.db`.
   */
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

  /** Update the conversation title. Writes to `pops.db`. */
  updateTitle(conversationId: string, title: string): void {
    this.db
      .update(conversations)
      .set({ title, updatedAt: this.now().toISOString() })
      .where(eq(conversations.id, conversationId))
      .run();
  }

  /** Replace the conversation's active scopes. Writes to `pops.db`. */
  updateScopes(conversationId: string, scopes: string[]): void {
    this.db
      .update(conversations)
      .set({ activeScopes: JSON.stringify(scopes), updatedAt: this.now().toISOString() })
      .where(eq(conversations.id, conversationId))
      .run();
  }

  /** Update the conversation's app context (US-03). Writes to `pops.db`. */
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

  /**
   * Get all context entries (engram associations) for a conversation
   * (US-03). Pure read — routed through `@pops/cerebrum-db`'s
   * `conversationsService.listConversationContext` against `readDb`.
   */
  getContextEntries(
    conversationId: string
  ): Array<{ engramId: string; relevanceScore: number | null; loadedAt: string }> {
    return conversationsService
      .listConversationContext(this.readDb, conversationId)
      .map((entry) => ({
        engramId: entry.engramId,
        relevanceScore: entry.relevanceScore,
        loadedAt: entry.loadedAt,
      }));
  }

  /**
   * Auto-generate title from first user message when no title is set.
   * Stays on the write handle (`db`) because it is a read-after-write
   * hop inside the `appendMessage` flow: the row we just inserted lives
   * only on `pops.db` until the next backfill, so consulting `readDb`
   * would silently miss it and skip the title.
   */
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
