/**
 * Ego conversation persistence service — fully routed through the
 * cerebrum pillar handle (`cerebrum.db`) after PRD-182 PR 3 collapses
 * the read/write split.
 *
 * Thin CRUD layer over the `conversations`, `messages`, and
 * `conversation_context` tables. PRD-182 PR 2 cut pure reads through
 * `@pops/cerebrum-db`'s `conversationsService` namespace while writes
 * still landed on the shared `pops.db`. This cutover (PR 3) closes the
 * split so every path — `createConversation`, `appendMessage` (plus
 * the auto-title heuristic's read-after-write hop), `upsertContext`,
 * `deleteConversation`, `updateTitle`, `updateScopes`,
 * `updateAppContext`, plus the read methods — routes through a single
 * `CerebrumDb` handle wired to `getCerebrumDrizzle()` in
 * `chat-helpers.ts` / `router-context.ts`.
 *
 * The boot-time backfill (`backfillCerebrumFromShared()` in
 * `apps/pops-api/src/db/backfill-cerebrum-from-shared.ts`) carries any
 * residual rows on the legacy shared `pops.db` forward on the first
 * deploy after the cut. Subsequent boots are no-ops via the per-table
 * existence filter; a follow-up PR retires the backfill and drops the
 * shared-journal shim.
 *
 * Heavy chat orchestration (LLM streaming, scope negotiation,
 * auto-title heuristic, persistence-store adapter) stays in pops-api
 * — `@pops/cerebrum-db` is pure data-access.
 */
import {
  conversationsService,
  MESSAGE_ROLES,
  type CerebrumDb,
  type MessageRole,
} from '@pops/cerebrum-db';

import { mapPackageConversation, mapPackageMessage } from './persistence-mappers.js';
import {
  autoTitle,
  generateConversationId,
  generateMessageId,
  type AppendMessageInput,
  type Conversation,
  type CreateConversationInput,
  type ListConversationsInput,
  type Message,
} from './types.js';

export type {
  AppendMessageInput,
  Conversation,
  CreateConversationInput,
  ListConversationsInput,
  Message,
} from './types.js';
export { autoTitle } from './types.js';

export interface ConversationPersistenceOptions {
  /**
   * Cerebrum pillar drizzle handle (`getCerebrumDrizzle()` in
   * production). After PRD-182 PR 3 every conversation read and write
   * — including the auto-title read-after-write hop inside
   * `appendMessage` — flows through this single handle. Test rigs that
   * inject an in-memory SQLite pass it here as the only DB argument.
   */
  db: CerebrumDb;
  now?: () => Date;
}

export class ConversationPersistence {
  private readonly db: CerebrumDb;
  private readonly now: () => Date;

  constructor(options: ConversationPersistenceOptions) {
    this.db = options.db;
    this.now = options.now ?? (() => new Date());
  }

  /** Create a new conversation. Writes to `cerebrum.db`. */
  createConversation(input: CreateConversationInput): Conversation {
    const now = this.now();
    const id = generateConversationId(now);
    const iso = now.toISOString();
    const row = conversationsService.insertConversation(this.db, {
      id,
      title: input.title ?? null,
      activeScopes: input.scopes ?? [],
      appContext: input.appContext ?? null,
      model: input.model,
      createdAt: iso,
      updatedAt: iso,
    });
    return mapPackageConversation(row);
  }

  /**
   * List conversations with optional pagination and title search.
   * Routed through `@pops/cerebrum-db`'s
   * `conversationsService.listConversations`.
   */
  listConversations(input: ListConversationsInput = {}): {
    conversations: Conversation[];
    total: number;
  } {
    const result = conversationsService.listConversations(this.db, {
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
   * Get a conversation with all its messages. Routed through
   * `@pops/cerebrum-db`'s `conversationsService.{getConversation,
   * listMessages}`. Returns `null` when the conversation is missing.
   */
  getConversation(id: string): { conversation: Conversation; messages: Message[] } | null {
    const conv = conversationsService.getConversation(this.db, id);
    if (!conv) return null;
    const msgs = conversationsService.listMessages(this.db, id);
    return {
      conversation: mapPackageConversation(conv),
      messages: msgs.map(mapPackageMessage),
    };
  }

  /**
   * Delete a conversation. The ON DELETE CASCADE on `messages` and
   * `conversation_context` carries the dependent rows along, so the
   * package's `deleteConversation` doesn't need an explicit transaction.
   */
  deleteConversation(id: string): void {
    conversationsService.deleteConversation(this.db, id);
  }

  /**
   * Append a message to a conversation. The package's `insertMessage`
   * already bumps `conversations.updated_at` atomically inside a
   * transaction. Auto-generates a title from the first user message
   * when none is set; the read-after-write hop stays on the same
   * `cerebrum.db` handle.
   */
  appendMessage(conversationId: string, input: AppendMessageInput): Message {
    const now = this.now();
    const id = generateMessageId(now);
    const iso = now.toISOString();
    const row = conversationsService.insertMessage(this.db, {
      id,
      conversationId,
      role: this.coerceRole(input.role),
      content: input.content,
      citations: input.citations ?? null,
      toolCalls: input.toolCalls ?? null,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
      createdAt: iso,
    });
    this.maybeAutoTitle(conversationId, input, iso);
    return mapPackageMessage(row);
  }

  /**
   * Insert or update a context entry linking a conversation to an
   * engram. Writes to `cerebrum.db`.
   */
  upsertContext(conversationId: string, engramId: string, relevanceScore?: number): void {
    const iso = this.now().toISOString();
    conversationsService.upsertConversationContext(this.db, {
      conversationId,
      engramId,
      relevanceScore: relevanceScore ?? null,
      loadedAt: iso,
    });
  }

  /** Update the conversation title. Writes to `cerebrum.db`. */
  updateTitle(conversationId: string, title: string): void {
    conversationsService.updateConversation(this.db, conversationId, {
      title,
      updatedAt: this.now().toISOString(),
    });
  }

  /** Replace the conversation's active scopes. Writes to `cerebrum.db`. */
  updateScopes(conversationId: string, scopes: string[]): void {
    conversationsService.updateConversation(this.db, conversationId, {
      activeScopes: scopes,
      updatedAt: this.now().toISOString(),
    });
  }

  /** Update the conversation's app context (US-03). Writes to `cerebrum.db`. */
  updateAppContext(conversationId: string, appContext: unknown): void {
    conversationsService.updateConversation(this.db, conversationId, {
      appContext: appContext ?? null,
      updatedAt: this.now().toISOString(),
    });
  }

  /**
   * Get all context entries (engram associations) for a conversation
   * (US-03). Routed through `@pops/cerebrum-db`'s
   * `conversationsService.listConversationContext`.
   */
  getContextEntries(
    conversationId: string
  ): Array<{ engramId: string; relevanceScore: number | null; loadedAt: string }> {
    return conversationsService.listConversationContext(this.db, conversationId).map((entry) => ({
      engramId: entry.engramId,
      relevanceScore: entry.relevanceScore,
      loadedAt: entry.loadedAt,
    }));
  }

  /**
   * Auto-generate title from the first user message when no title is
   * set. The read-after-write hop reuses the single `cerebrum.db`
   * handle, so it sees the row we just inserted.
   */
  private maybeAutoTitle(
    conversationId: string,
    input: AppendMessageInput,
    timestamp: string
  ): void {
    if (input.role !== 'user') return;
    const conv = conversationsService.getConversation(this.db, conversationId);
    if (!conv || conv.title) return;
    const userCount = conversationsService.countMessages(this.db, conversationId, 'user');
    if (userCount !== 1) return;
    conversationsService.updateConversation(this.db, conversationId, {
      title: autoTitle(input.content),
      updatedAt: timestamp,
    });
  }

  private coerceRole(role: string): MessageRole {
    for (const allowed of MESSAGE_ROLES) {
      if (allowed === role) return allowed;
    }
    throw new Error(`Invalid message role: ${role}`);
  }
}
