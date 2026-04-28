/**
 * Pure helper functions for the ConversationEngine.
 *
 * Extracted to keep engine.ts within the max-lines lint rule.
 */
import { getSettingValue } from '../core/settings/service.js';

import type { RetrievalFilters } from '../cerebrum/retrieval/types.js';
import type { EngineConfig, Message } from './types.js';

function getEgoDefaultModel(): string {
  return getSettingValue('ego.defaultModel', 'claude-sonnet-4-20250514');
}

function getEgoMaxHistory(): number {
  return getSettingValue('ego.maxHistory', 20);
}

function getEgoMaxRetrieval(): number {
  return getSettingValue('ego.maxRetrieval', 5);
}

function getEgoTokenBudget(): number {
  return getSettingValue('ego.tokenBudget', 4096);
}

function getEgoRelevanceThreshold(): number {
  return getSettingValue('ego.relevanceThreshold', 0.3);
}

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
    model: config?.model ?? getEgoDefaultModel(),
    maxHistoryMessages: config?.maxHistoryMessages ?? getEgoMaxHistory(),
    maxRetrievalResults: config?.maxRetrievalResults ?? getEgoMaxRetrieval(),
    tokenBudget: config?.tokenBudget ?? getEgoTokenBudget(),
    relevanceThreshold: config?.relevanceThreshold ?? getEgoRelevanceThreshold(),
  };
}
