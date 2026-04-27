/**
 * Ego conversation types, ID generation, and mapping helpers.
 */
import type { conversations, messages } from '@pops/db-types/schema';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a short hex hash from crypto.randomUUID. Uses the first 8 hex chars
 * of a v4 UUID, giving ~4 billion combinations — collision-safe for
 * single-user conversation volumes.
 */
function shortHash(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 8);
}

/** Format a Date as the compact timestamp used in IDs (YYYYMMDD_HHmmss). */
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

// ---------------------------------------------------------------------------
// Title auto-generation
// ---------------------------------------------------------------------------

const MARKDOWN_NOISE = /^#{1,6}\s+|[*_~`]+/g;

/**
 * Derive a title from the first user message. Strips leading Markdown heading
 * markers and inline formatting, then truncates to 80 characters at the
 * nearest word boundary.
 */
export function autoTitle(content: string): string {
  const cleaned = content.replace(MARKDOWN_NOISE, '').trim();
  if (cleaned.length <= 80) return cleaned;

  const truncated = cleaned.slice(0, 80);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Conversation {
  id: string;
  title: string | null;
  activeScopes: string[];
  appContext: unknown | null;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  citations: string[] | null;
  toolCalls: unknown[] | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
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

// ---------------------------------------------------------------------------
// Engine types (PRD-087 US-01)
// ---------------------------------------------------------------------------

/** Which pops app the user is currently viewing. */
export interface AppContext {
  app: string;
  route?: string;
  entityId?: string;
  entityType?: string;
}

/** Result returned from ConversationEngine.chat(). */
export interface ChatResult {
  response: {
    content: string;
    citations: string[];
    tokensIn: number;
    tokensOut: number;
  };
  retrievedEngrams: Array<{
    engramId: string;
    relevanceScore: number;
  }>;
}

/** Parameters for ConversationEngine.chat(). */
export interface ChatParams {
  conversationId: string;
  message: string;
  history: Message[];
  activeScopes: string[];
  appContext?: AppContext;
}

/** Configuration for the conversation engine. */
export interface EngineConfig {
  model: string;
  maxHistoryMessages: number;
  maxRetrievalResults: number;
  tokenBudget: number;
  relevanceThreshold: number;
}

/**
 * Abstraction over conversation persistence for the engine.
 * Implemented by PersistenceStoreAdapter wrapping ConversationPersistence.
 */
export interface ConversationStore {
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(params: {
    id: string;
    title: string | null;
    activeScopes: string[];
    appContext: AppContext | null;
    model: string;
  }): Promise<Conversation>;
  getMessages(conversationId: string): Promise<Message[]>;
  addMessage(conversationId: string, message: Message): Promise<void>;
  touchConversation(conversationId: string): Promise<void>;
  addContextEngrams(
    conversationId: string,
    engrams: Array<{ engramId: string; relevanceScore: number }>
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    activeScopes: JSON.parse(row.activeScopes) as string[],
    appContext: row.appContext ? (JSON.parse(row.appContext) as unknown) : null,
    model: row.model,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    citations: row.citations ? (JSON.parse(row.citations) as string[]) : null,
    toolCalls: row.toolCalls ? (JSON.parse(row.toolCalls) as unknown[]) : null,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    createdAt: row.createdAt,
  };
}
