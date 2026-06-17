/**
 * Shared chat orchestration helpers used by both the `ego.chat` handler and the
 * SSE streaming route.
 *
 * Lifted from the monolith; the persistence + engine are passed in (no
 * singletons) so the handler factory wires them from the injected deps.
 */
import { autoTitle, type ConversationPersistence } from './persistence.js';

import type { Conversation, Message } from './persistence.js';
import type { AppContext, ChatResult, ScopeNegotiation } from './types.js';

/**
 * Compare two AppContext values by value (not reference). Returns true if the
 * incoming context is meaningfully different from the stored one.
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

export interface PersistUserTurnParams {
  persistence: ConversationPersistence;
  conversationId: string;
  userMessage: string;
  storedAppContext?: AppContext | null;
  incomingAppContext?: AppContext;
}

/**
 * Persist the user's turn before any engine work. Writing up-front means a
 * downstream pipeline failure cannot delete the user's own input from the
 * conversation.
 */
export function persistUserTurn(params: PersistUserTurnParams): Message {
  const { persistence, conversationId, userMessage } = params;
  if (appContextChanged(params.storedAppContext, params.incomingAppContext)) {
    persistence.updateAppContext(conversationId, params.incomingAppContext ?? null);
  }
  return persistence.appendMessage(conversationId, { role: 'user', content: userMessage });
}

export interface PersistAssistantTurnParams {
  persistence: ConversationPersistence;
  conversationId: string;
  result: ChatResult;
}

/** Persist the assistant turn after the engine returns: scopes, message, engram context. */
export function persistAssistantTurn(params: PersistAssistantTurnParams): Message {
  const { persistence, conversationId, result } = params;

  if (result.scopeNegotiation?.changed) {
    persistence.updateScopes(conversationId, result.scopeNegotiation.scopes);
  }

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

/** Persist a placeholder assistant message so a pipeline failure shows up in the thread. */
export function persistAssistantError(
  persistence: ConversationPersistence,
  conversationId: string,
  reason: string
): Message {
  return persistence.appendMessage(conversationId, {
    role: 'assistant',
    content: `⚠️ Pipeline error: ${reason}`,
  });
}

export interface ResolveConversationParams {
  persistence: ConversationPersistence;
  conversationId: string | undefined;
  message: string;
  scopes: string[];
  appContext: AppContext | undefined;
  model: string;
}

/** Load an existing conversation or create a new one. */
export function resolveConversation(params: ResolveConversationParams): Conversation {
  const { persistence, conversationId, message, scopes, appContext, model } = params;
  if (conversationId) {
    const existing = persistence.getConversation(conversationId);
    if (existing) return existing.conversation;
  }
  return persistence.createConversation({
    title: autoTitle(message),
    scopes,
    appContext,
    model,
  });
}

export interface PersistStreamParams {
  persistence: ConversationPersistence;
  conversationId: string;
  content: string;
  citations: string[];
  tokensIn: number;
  tokensOut: number;
  retrievedEngrams: Array<{ engramId: string; relevanceScore: number }>;
  scopeNegotiation: ScopeNegotiation;
}

/** Persist results after a streaming chat completes. */
export function persistStreamResults(params: PersistStreamParams): Message {
  return persistAssistantTurn({
    persistence: params.persistence,
    conversationId: params.conversationId,
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
  });
}
