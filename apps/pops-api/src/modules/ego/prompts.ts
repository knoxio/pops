/**
 * LLM system prompt templates for the Ego conversation engine (PRD-087 US-01).
 *
 * Prompts are exported as pure functions so they can be tested and overridden
 * without coupling to the engine class.
 */

import type { AppContext } from './types.js';

/**
 * Build the Ego system prompt for a conversation turn.
 *
 * @param scopes     - Active scopes for this conversation.
 * @param appContext  - Current app/route context the user is viewing (optional).
 */
export function buildEgoSystemPrompt(scopes: string[], appContext?: AppContext): string {
  const scopeList = scopes.length > 0 ? scopes.join(', ') : '(all non-secret scopes)';

  const appLine = appContext ? `\nThe user is currently in: ${appContext.app}` : '';
  const routeLine = appContext?.route ? ` (route: ${appContext.route})` : '';
  const entityLine =
    appContext?.entityId && appContext.entityType
      ? ` viewing ${appContext.entityType}: ${appContext.entityId}`
      : '';

  return `You are Ego, the conversational interface to Cerebrum \u2014 a personal knowledge management system.

Your capabilities:
- Search and retrieve knowledge from the user's engram library
- Answer questions grounded in stored engrams
- Help the user explore connections between their stored knowledge

Active scopes for this conversation: ${scopeList}${appLine}${routeLine}${entityLine}

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
