/**
 * Conversations data-access for the cerebrum pillar (ego-core).
 *
 * Scope boundary: this file is the SQL seam for the conversations slice.
 * It covers CRUD on `conversations`, append/read on `messages`, and
 * upsert/list on `conversation_context` (the engram association junction
 * table). All writes serialise JSON-encoded columns (`active_scopes`,
 * `app_context`, `citations`, `tool_calls`) and apply the throw-if-not-
 * found contract via the typed errors in `conversations-errors.ts`.
 *
 * Domain orchestration (chat streaming, model selection, scope
 * negotiation, auto-titling, persistence-store wiring) lives in the
 * pillar's ego module, not here — this stays pure data-access (no
 * node:fs, no zod cross-validation, no LLM client wiring).
 *
 * Functions take a `CerebrumDb` handle as their first argument; the
 * caller resolves the singleton or transaction handle. Mirrors the
 * `nudge-log.ts` / `engrams.ts` / `glia.ts` db-arg pattern in this slice.
 */
import { and, asc, count, desc, eq, like } from 'drizzle-orm';

import { conversationContext, conversations, messages } from '../schema.js';
import {
  ConversationConflictError,
  ConversationNotFoundError,
  MessageConflictError,
  MessageNotFoundError,
} from './conversations-errors.js';
import { rowToContextEntry, rowToConversation, rowToMessage } from './conversations-helpers.js';

import type {
  Conversation,
  ConversationContextEntry,
  ConversationListFilters,
  InsertConversationRow,
  InsertMessageRow,
  ListConversationsResult,
  Message,
  UpdateConversationPatch,
  UpsertContextRow,
} from './conversations-types.js';
import type { CerebrumDb } from './internal.js';

export { rowToContextEntry, rowToConversation, rowToMessage };
export {
  ConversationConflictError,
  ConversationNotFoundError,
  MessageConflictError,
  MessageNotFoundError,
};

/** Fetch a single conversation by id. Returns null when missing. */
export function getConversation(db: CerebrumDb, id: string): Conversation | null {
  const row = db.select().from(conversations).where(eq(conversations.id, id)).get();
  return row ? rowToConversation(row) : null;
}

/**
 * Strict variant of `getConversation` — throws `ConversationNotFoundError`
 * when the row is missing. The caller picks the variant that matches the
 * surrounding flow's error contract.
 */
export function requireConversation(db: CerebrumDb, id: string): Conversation {
  const found = getConversation(db, id);
  if (!found) throw new ConversationNotFoundError(id);
  return found;
}

/**
 * Paginated list of conversations. Orders by `updated_at desc` so the
 * most recently touched session surfaces first. The optional `search`
 * filters by title via LIKE. Returns both the rows and the unpaginated
 * `total`.
 */
export function listConversations(
  db: CerebrumDb,
  filters: ConversationListFilters = {}
): ListConversationsResult {
  const { search, limit = 50, offset = 0 } = filters;
  const where = search ? like(conversations.title, `%${search}%`) : undefined;

  const rows = db
    .select()
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const [totalRow] = db.select({ total: count() }).from(conversations).where(where).all();

  return {
    conversations: rows.map(rowToConversation),
    total: totalRow?.total ?? 0,
  };
}

/**
 * Insert a fully-formed `conversations` row. The caller is expected to
 * have generated the id and resolved timestamps; this function only
 * serialises and writes. Throws `ConversationConflictError` if the id
 * already exists so the caller can distinguish create-vs-update intent.
 */
export function insertConversation(db: CerebrumDb, row: InsertConversationRow): Conversation {
  if (getConversation(db, row.id)) throw new ConversationConflictError(row.id);
  const values = {
    id: row.id,
    title: row.title,
    activeScopes: JSON.stringify([...row.activeScopes]),
    appContext: row.appContext != null ? JSON.stringify(row.appContext) : null,
    model: row.model,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  db.insert(conversations).values(values).run();
  return rowToConversation(values);
}

/**
 * Apply a patch to a conversation row. The patch shape is intentionally
 * narrow: only mutable columns can be set. Identity columns (`id`,
 * `model`, `createdAt`) are immutable post-insert. Throws
 * `ConversationNotFoundError` when the row does not exist; the caller is
 * forced to supply `updatedAt` so the data layer never reaches for a
 * clock.
 */
export function updateConversation(
  db: CerebrumDb,
  id: string,
  patch: UpdateConversationPatch
): Conversation {
  if (!getConversation(db, id)) throw new ConversationNotFoundError(id);
  const next: Record<string, unknown> = { updatedAt: patch.updatedAt };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.activeScopes !== undefined) next.activeScopes = JSON.stringify([...patch.activeScopes]);
  if (patch.appContext !== undefined) {
    next.appContext = patch.appContext != null ? JSON.stringify(patch.appContext) : null;
  }
  db.update(conversations).set(next).where(eq(conversations.id, id)).run();
  return requireConversation(db, id);
}

/**
 * Delete a conversation. The ON DELETE CASCADE on the FK columns of
 * `messages` and `conversation_context` carries the dependent rows
 * along, so callers don't need an explicit transaction. Returns the
 * number of conversation rows deleted (0 if `id` was already gone —
 * caller can treat this as idempotent).
 */
export function deleteConversation(db: CerebrumDb, id: string): number {
  return db.delete(conversations).where(eq(conversations.id, id)).run().changes;
}

/** Fetch a single message by id. Returns null when missing. */
export function getMessage(db: CerebrumDb, id: string): Message | null {
  const row = db.select().from(messages).where(eq(messages.id, id)).get();
  return row ? rowToMessage(row) : null;
}

/**
 * List every message for a conversation, ordered by `created_at asc` so
 * the chat surface can render the stream chronologically without an
 * additional sort.
 */
export function listMessages(db: CerebrumDb, conversationId: string): Message[] {
  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .all();
  return rows.map(rowToMessage);
}

/**
 * Insert a message and bump the parent conversation's `updated_at` so
 * the conversation list re-sorts to surface the active session. Wrapped
 * in a transaction so the two writes commit atomically. Throws
 * `ConversationNotFoundError` if the parent conversation is missing and
 * `MessageConflictError` if the supplied message id already exists.
 */
export function insertMessage(db: CerebrumDb, row: InsertMessageRow): Message {
  if (!getConversation(db, row.conversationId)) {
    throw new ConversationNotFoundError(row.conversationId);
  }
  if (getMessage(db, row.id)) throw new MessageConflictError(row.id);
  const values = {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    citations: row.citations != null ? JSON.stringify(row.citations) : null,
    toolCalls: row.toolCalls != null ? JSON.stringify(row.toolCalls) : null,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    createdAt: row.createdAt,
  };
  db.transaction((tx) => {
    tx.insert(messages).values(values).run();
    tx.update(conversations)
      .set({ updatedAt: row.createdAt })
      .where(eq(conversations.id, row.conversationId))
      .run();
  });
  return rowToMessage(values);
}

/**
 * Delete a message by id. Returns the number of rows actually deleted
 * (0 if missing — caller can treat this as idempotent). Does not bump
 * the conversation's `updated_at`: deletion is an administrative
 * operation, not a chat-stream event.
 */
export function deleteMessage(db: CerebrumDb, id: string): number {
  return db.delete(messages).where(eq(messages.id, id)).run().changes;
}

/**
 * Count messages for a conversation, optionally filtered by role. The
 * auto-title heuristic uses this to detect the first user message; the
 * data layer owns the COUNT so the orchestration code stays focused on
 * the heuristic.
 */
export function countMessages(
  db: CerebrumDb,
  conversationId: string,
  role?: Message['role']
): number {
  const where = role
    ? and(eq(messages.conversationId, conversationId), eq(messages.role, role))
    : eq(messages.conversationId, conversationId);
  const row = db.select({ total: count() }).from(messages).where(where).get();
  return row?.total ?? 0;
}

/**
 * Insert or update a context entry linking a conversation to an engram.
 * Conflict target is the composite primary key (conversation_id,
 * engram_id); re-loading the same engram into the same conversation
 * refreshes `relevance_score` and `loaded_at`. Throws
 * `ConversationNotFoundError` if the parent conversation is missing.
 */
export function upsertConversationContext(db: CerebrumDb, row: UpsertContextRow): void {
  if (!getConversation(db, row.conversationId)) {
    throw new ConversationNotFoundError(row.conversationId);
  }
  db.insert(conversationContext)
    .values(row)
    .onConflictDoUpdate({
      target: [conversationContext.conversationId, conversationContext.engramId],
      set: { relevanceScore: row.relevanceScore, loadedAt: row.loadedAt },
    })
    .run();
}

/**
 * List context entries for a conversation, ordered by `loaded_at desc`
 * so the freshest engram association surfaces first.
 */
export function listConversationContext(
  db: CerebrumDb,
  conversationId: string
): ConversationContextEntry[] {
  const rows = db
    .select()
    .from(conversationContext)
    .where(eq(conversationContext.conversationId, conversationId))
    .orderBy(desc(conversationContext.loadedAt))
    .all();
  return rows.map(rowToContextEntry);
}

/**
 * Remove a single engram association from a conversation. Returns the
 * number of rows actually deleted (0 if missing — caller can treat this
 * as idempotent).
 */
export function deleteConversationContext(
  db: CerebrumDb,
  conversationId: string,
  engramId: string
): number {
  return db
    .delete(conversationContext)
    .where(
      and(
        eq(conversationContext.conversationId, conversationId),
        eq(conversationContext.engramId, engramId)
      )
    )
    .run().changes;
}
