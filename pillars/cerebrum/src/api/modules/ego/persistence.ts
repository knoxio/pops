/**
 * Ego conversation persistence for the cerebrum pillar.
 *
 * Thin CRUD over the pillar `conversationsService` (conversations / messages /
 * conversation_context). Lifted from the monolith `ConversationPersistence`;
 * the db handle is injected (`deps.cerebrumDb.db`) rather than resolved from an
 * AsyncLocalStorage drizzle handle. Every read/write — including the auto-title
 * read-after-write hop — runs on the one injected handle, and the
 * append-message + updated_at bump stays transactional inside
 * `conversationsService.insertMessage`.
 */
import {
  conversationsService,
  MESSAGE_ROLES,
  type CerebrumDb,
  type Conversation,
  type ConversationContextEntry,
  type Message,
  type MessageRole,
} from '../../../db/index.js';

export type { Conversation, Message } from '../../../db/index.js';

const MARKDOWN_NOISE = /^#{1,6}\s+|[*_~`]+/g;

function shortHash(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 8);
}

function idTimestamp(date: Date): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  return [
    pad(date.getFullYear(), 4),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

export function generateConversationId(now: Date): string {
  return `conv_${idTimestamp(now)}_${shortHash()}`;
}

export function generateMessageId(now: Date): string {
  return `msg_${idTimestamp(now)}_${shortHash()}`;
}

/**
 * Derive a title from the first user message. Strips leading Markdown heading
 * markers and inline formatting, then truncates to 80 chars at a word boundary.
 */
export function autoTitle(content: string): string {
  const cleaned = content.replace(MARKDOWN_NOISE, '').trim();
  if (cleaned.length <= 80) return cleaned;
  const truncated = cleaned.slice(0, 80);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

export interface CreateConversationInput {
  title?: string;
  scopes?: string[];
  appContext?: unknown;
  model: string;
}

export interface ListConversationsInput {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface AppendMessageInput {
  role: string;
  content: string;
  citations?: string[];
  toolCalls?: unknown[];
  tokensIn?: number;
  tokensOut?: number;
}

export interface ConversationPersistenceOptions {
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

  createConversation(input: CreateConversationInput): Conversation {
    const now = this.now();
    const id = generateConversationId(now);
    const iso = now.toISOString();
    return conversationsService.insertConversation(this.db, {
      id,
      title: input.title ?? null,
      activeScopes: input.scopes ?? [],
      appContext: input.appContext ?? null,
      model: input.model,
      createdAt: iso,
      updatedAt: iso,
    });
  }

  listConversations(input: ListConversationsInput = {}): {
    conversations: Conversation[];
    total: number;
  } {
    return conversationsService.listConversations(this.db, {
      search: input.search,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    });
  }

  getConversation(id: string): { conversation: Conversation; messages: Message[] } | null {
    const conversation = conversationsService.getConversation(this.db, id);
    if (!conversation) return null;
    return { conversation, messages: conversationsService.listMessages(this.db, id) };
  }

  deleteConversation(id: string): void {
    conversationsService.deleteConversation(this.db, id);
  }

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
    return row;
  }

  upsertContext(conversationId: string, engramId: string, relevanceScore?: number): void {
    conversationsService.upsertConversationContext(this.db, {
      conversationId,
      engramId,
      relevanceScore: relevanceScore ?? null,
      loadedAt: this.now().toISOString(),
    });
  }

  updateScopes(conversationId: string, scopes: string[]): void {
    conversationsService.updateConversation(this.db, conversationId, {
      activeScopes: scopes,
      updatedAt: this.now().toISOString(),
    });
  }

  updateAppContext(conversationId: string, appContext: unknown): void {
    conversationsService.updateConversation(this.db, conversationId, {
      appContext: appContext ?? null,
      updatedAt: this.now().toISOString(),
    });
  }

  getContextEntries(conversationId: string): ConversationContextEntry[] {
    return conversationsService.listConversationContext(this.db, conversationId);
  }

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
