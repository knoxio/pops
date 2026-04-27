/**
 * LLM system prompt templates for the Ego conversation engine (PRD-087 US-01, US-03).
 *
 * Prompts are exported as pure functions so they can be tested and overridden
 * without coupling to the engine class.
 */

import type { AppContext } from './types.js';

/** Human-readable labels for pops app names used in context descriptions. */
const APP_LABELS: Record<string, string> = {
  finance: 'finance',
  media: 'media',
  inventory: 'inventory',
  cerebrum: 'Cerebrum',
  ai: 'AI Ops',
};

/** Human-readable labels for entity types used in context descriptions. */
const ENTITY_LABELS: Record<string, string> = {
  engram: 'engram',
  transaction: 'transaction',
  movie: 'movie',
  tv_show: 'TV show',
  item: 'inventory item',
};

/**
 * Format app context into a human-readable description for the system prompt.
 *
 * Examples:
 * - "The user is currently viewing their movie collection in the media app"
 * - "The user is looking at transaction #1234 in the finance app"
 * - "The user is viewing engram eng_20260427_1500_test in Cerebrum"
 */
export function formatAppContextDescription(appContext: AppContext): string {
  const appLabel = APP_LABELS[appContext.app] ?? appContext.app;
  const entityLabel = appContext.entityType
    ? (ENTITY_LABELS[appContext.entityType] ?? appContext.entityType)
    : null;

  if (appContext.entityId && entityLabel) {
    if (appContext.entityType === 'engram') {
      return `The user is viewing ${entityLabel} ${appContext.entityId} in ${appLabel}`;
    }
    return `The user is looking at ${entityLabel} #${appContext.entityId} in the ${appLabel} app`;
  }

  if (appContext.route) {
    return `The user is currently on ${appContext.route} in the ${appLabel} app`;
  }

  return `The user is currently in the ${appLabel} app`;
}

/**
 * Build the Ego system prompt for a conversation turn.
 *
 * @param scopes     - Active scopes for this conversation.
 * @param appContext  - Current app/route context the user is viewing (optional).
 */
export function buildEgoSystemPrompt(scopes: string[], appContext?: AppContext): string {
  const scopeList = scopes.length > 0 ? scopes.join(', ') : '(all non-secret scopes)';

  const contextLine = appContext ? `\n${formatAppContextDescription(appContext)}` : '';

  return `You are Ego, the conversational interface to Cerebrum \u2014 a personal knowledge management system.

Your capabilities:
- Search and retrieve knowledge from the user's engram library
- Answer questions grounded in stored engrams
- Help the user explore connections between their stored knowledge

Active scopes for this conversation: ${scopeList}${contextLine}

When referencing engrams, always cite them by ID in square brackets: [eng_YYYYMMDD_HHmm_slug]
If the available context doesn't contain enough information, say so explicitly rather than guessing.`;
}

/**
 * Build a summarisation prompt for compressing older conversation history.
 *
 * @param messages - Formatted message block to summarise.
 */
export function buildSummarisationPrompt(messages: string): string {
  return `Summarise this conversation so far in 2-3 sentences. Focus on the key topics discussed, decisions made, and any engrams referenced. Be concise.

Conversation:
${messages}`;
}
