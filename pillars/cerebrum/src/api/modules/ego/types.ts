/**
 * Ego conversation engine domain types (PRD-087).
 *
 * The conversation/message/context row shapes live in the pillar db package
 * (`conversationsService`); these are the engine-level shapes (chat params,
 * results, streaming events, scope negotiation) the lifted engine traffics in.
 */
import type { Message } from '../../../db/index.js';

export type { Message };

/** Which pops app the user is currently viewing. */
export interface AppContext {
  app: string;
  route?: string;
  entityId?: string;
  entityType?: string;
}

/** Scope negotiation outcome included in ChatResult. */
export interface ScopeNegotiation {
  scopes: string[];
  changed: boolean;
  reason: string | null;
  secretNotice: string | null;
}

/** Result returned from ConversationEngine.chat(). */
export interface ChatResult {
  response: {
    content: string;
    citations: string[];
    tokensIn: number;
    tokensOut: number;
  };
  retrievedEngrams: Array<{ engramId: string; relevanceScore: number }>;
  /** Scope negotiation outcome, present when negotiation was run. */
  scopeNegotiation?: ScopeNegotiation;
}

/** A partial text token yielded during streaming. */
export interface ChatStreamToken {
  type: 'token';
  text: string;
}

/** Final metadata yielded when the stream completes. */
export interface ChatStreamDone {
  type: 'done';
  content: string;
  citations: string[];
  tokensIn: number;
  tokensOut: number;
}

/** Union of events yielded by the engine's streaming generator. */
export type ChatStreamEvent = ChatStreamToken | ChatStreamDone;

/** Preparation result from ConversationEngine.prepareStream(). */
export interface ChatStreamPreparation {
  stream: AsyncGenerator<ChatStreamEvent>;
  retrievedEngrams: Array<{ engramId: string; relevanceScore: number }>;
  scopeNegotiation: ScopeNegotiation;
}

/** Channels through which Ego conversations can originate. */
export type EgoChannel = 'shell' | 'moltbot' | 'mcp' | 'cli';

/** Parameters for ConversationEngine.chat(). */
export interface ChatParams {
  conversationId: string;
  message: string;
  history: Message[];
  activeScopes: string[];
  appContext?: AppContext;
  /** Channel the conversation originates from (for scope defaults). */
  channel?: EgoChannel;
  /** All known scopes in the system (for scope negotiation matching). */
  knownScopes?: string[];
}

/** Configuration for the conversation engine. */
export interface EngineConfig {
  maxHistoryMessages: number;
  maxRetrievalResults: number;
  tokenBudget: number;
  relevanceThreshold: number;
}
