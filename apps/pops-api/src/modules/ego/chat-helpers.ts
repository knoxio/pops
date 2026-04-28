/**
 * Shared chat orchestration helpers used by both the tRPC ego.chat mutation
 * and the SSE streaming endpoint.
 *
 * Extracted to avoid duplicating persistence, conversation resolution,
 * and app context comparison logic across the two code paths.
 */
import { getDrizzle } from '../../db.js';
import { ConversationEngine } from './engine.js';
import { PersistenceStoreAdapter } from './persistence-store.js';
import { ConversationPersistence } from './persistence.js';
import { autoTitle } from './types.js';

import type { AppContext, ChatResult, Conversation, Message, ScopeNegotiation } from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Lazily instantiated persistence service (uses the global Drizzle instance). */
export function getPersistence(): ConversationPersistence {
  return new ConversationPersistence({ db: getDrizzle() });
}

export function getStore(): PersistenceStoreAdapter {
  return new PersistenceStoreAdapter(getPersistence());
}

export function getEngine(): ConversationEngine {
  return new ConversationEngine();
}

/**
 * Check whether two AppContext values differ (by value, not reference).
 * Returns true if the incoming context is meaningfully different from stored.
 */
export function appContextChanged(
  stored: AppContext | undefined | null,
  incoming: AppContext | undefined
): boolean {
  if (!stored && !incoming) return false;
  if (!stored || !incoming) return true;
  return (
    stored.app !== incoming.app ||
    stored.route !== incoming.route ||
    stored.entityId !== incoming.entityId ||
    stored.entityType !== incoming.entityType
  );
}

export interface PersistChatParams {
  persistence: ConversationPersistence;
  conversationId: string;
  userMessage: string;
  result: ChatResult;
  storedAppContext?: AppContext | null;
  incomingAppContext?: AppContext;
}

/** Persist chat results: scope changes, app context changes, messages, and engram context. */
export function persistChatResults(params: PersistChatParams): Message {
  const { persistence, conversationId, userMessage, result } = params;

  if (result.scopeNegotiation?.changed) {
    persistence.updateScopes(conversationId, result.scopeNegotiation.scopes);
  }

  if (appContextChanged(params.storedAppContext, params.incomingAppContext)) {
    persistence.updateAppContext(conversationId, params.incomingAppContext ?? null);
  }

  persistence.appendMessage(conversationId, { role: 'user', content: userMessage });

  const assistantMsg = persistence.appendMessage(conversationId, {
    role: 'assistant',
    content: result.response.content,
    citations: result.response.citations,
    tokensIn: result.response.tokensIn,
    tokensOut: result.response.tokensOut,
  });

  for (const { engramId, relevanceScore } of result.retrievedEngrams) {
    persistence.upsertContext(conversationId, engramId, relevanceScore);
  }

  return assistantMsg;
}

export interface ResolveConversationParams {
  store: PersistenceStoreAdapter;
  persistence: ConversationPersistence;
  conversationId: string | undefined;
  message: string;
  scopes: string[];
  appContext: AppContext | undefined;
}

/** Load an existing conversation or create a new one. */
export async function resolveConversation(
  params: ResolveConversationParams
): Promise<Conversation> {
  const { store, persistence, conversationId, message, scopes, appContext } = params;
  if (conversationId) {
    const existing = await store.getConversation(conversationId);
    if (existing) return existing;
  }
  return persistence.createConversation({
    title: autoTitle(message),
    scopes,
    appContext,
    model: DEFAULT_MODEL,
  });
}

/** Persist streaming chat results after the stream completes. */
export interface PersistStreamParams {
  persistence: ConversationPersistence;
  conversationId: string;
  userMessage: string;
  content: string;
  citations: string[];
  tokensIn: number;
  tokensOut: number;
  retrievedEngrams: Array<{ engramId: string; relevanceScore: number }>;
  scopeNegotiation: ScopeNegotiation;
  storedAppContext?: AppContext | null;
  incomingAppContext?: AppContext;
}

/** Persist results after a streaming chat completes. */
export function persistStreamResults(params: PersistStreamParams): Message {
  return persistChatResults({
    persistence: params.persistence,
    conversationId: params.conversationId,
    userMessage: params.userMessage,
    result: {
      response: {
        content: params.content,
        citations: params.citations,
        tokensIn: params.tokensIn,
        tokensOut: params.tokensOut,
      },
      retrievedEngrams: params.retrievedEngrams,
      scopeNegotiation: params.scopeNegotiation,
    },
    storedAppContext: params.storedAppContext,
    incomingAppContext: params.incomingAppContext,
  });
}
