/**
 * Pure helper functions for the ConversationEngine.
 *
 * Extracted to keep engine.ts within the max-lines lint rule.
 */
import type { RetrievalFilters } from '../cerebrum/retrieval/types.js';
import type { EngineConfig, Message } from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_HISTORY = 20;
const DEFAULT_MAX_RETRIEVAL = 5;
const DEFAULT_TOKEN_BUDGET = 4096;
const DEFAULT_RELEVANCE_THRESHOLD = 0.3;

function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

export function buildRetrievalFilters(scopes: string[]): RetrievalFilters {
  const filters: RetrievalFilters = {};
  if (scopes.length > 0) {
    filters.scopes = scopes;
  }
  if (scopes.some(isSecretScope)) {
    filters.includeSecret = true;
  }
  return filters;
}

function roleLabel(role: string): string {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  return 'System';
}

export function formatHistoryForContext(messages: Message[]): string {
  return messages.map((m) => `${roleLabel(m.role)}: ${m.content}`).join('\n\n');
}

export function buildDefaultConfig(config?: Partial<EngineConfig>): EngineConfig {
  return {
    model: config?.model ?? DEFAULT_MODEL,
    maxHistoryMessages: config?.maxHistoryMessages ?? DEFAULT_MAX_HISTORY,
    maxRetrievalResults: config?.maxRetrievalResults ?? DEFAULT_MAX_RETRIEVAL,
    tokenBudget: config?.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
    relevanceThreshold: config?.relevanceThreshold ?? DEFAULT_RELEVANCE_THRESHOLD,
  };
}
