/**
 * Shared chat orchestration helpers used by both the tRPC ego.chat mutation
 * and the SSE streaming endpoint.
 *
 * Extracted to avoid duplicating persistence, conversation resolution,
 * and app context comparison logic across the two code paths.
 */
import { getCerebrumDrizzle } from '../../../db/cerebrum-handle.js';
import { getSettingValue } from '../../core/settings/service.js';
import { ConversationEngine } from './engine.js';
import { PersistenceStoreAdapter } from './persistence-store.js';
import { ConversationPersistence } from './persistence.js';
import { autoTitle } from './types.js';

import type { AppContext, ChatResult, Conversation, Message, ScopeNegotiation } from './types.js';

/**
 * Lazily instantiated persistence service. Every conversation read,
 * write, and read-after-write hop routes through the cerebrum pillar
 * handle (`cerebrum.db`) after PRD-182 PR 3 collapses the read/write
 * split. See `ConversationPersistence` top-of-file JSDoc for the
 * cross-store consistency contract.
 */
export function getPersistence(): ConversationPersistence {
  return new ConversationPersistence({ db: getCerebrumDrizzle() });
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

export interface PersistUserTurnParams {
  persistence: ConversationPersistence;
  conversationId: string;
  userMessage: string;
  storedAppContext?: AppContext | null;
  incomingAppContext?: AppContext;
}

/**
 * Persist the user's turn before any engine work.
 *
 * Writing up-front means a downstream pipeline failure (embedding 4xx, LLM
 * timeout, etc.) cannot delete the user's own input from the conversation —
 * the assistant turn or error placeholder is persisted separately afterwards.
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

/** Persist the assistant turn after the engine returns: scope updates, assistant message, engram context. */
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
    model: getSettingValue('ego.defaultModel', 'claude-sonnet-4-6'),
  });
}

/** Persist streaming chat results after the stream completes. */
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
