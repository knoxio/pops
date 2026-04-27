/**
 * LLM system prompt templates for the Ego conversation engine (PRD-087 US-01, US-03).
 *
 * Prompts are exported as pure functions so they can be tested and overridden
 * without coupling to the engine class.
 */

import type { AppContext } from './types.js';

/** Human-readable descriptions for each pops app. */
const APP_DESCRIPTIONS: Record<string, string> = {
  finance: 'the Finance app (transactions, budgets, entities, imports)',
  media: 'the Media app (movies, TV shows, watchlist, watch history, rankings)',
  inventory: 'the Inventory app (items, locations, warranties, insurance)',
  cerebrum: 'the Cerebrum knowledge base (engrams, scopes, retrieval)',
  ai: 'the AI Ops app (usage tracking, model config, rules)',
};

/**
 * Format an AppContext into a human-readable context description block.
 *
 * Returns an empty string when no app context is provided.
 */
export function formatAppContextBlock(appContext?: AppContext): string {
  if (!appContext) return '';

  const appDesc = APP_DESCRIPTIONS[appContext.app] ?? `the ${appContext.app} app`;
  const parts: string[] = [`The user is currently in ${appDesc}.`];

  if (appContext.route) {
    parts.push(`Current route: ${appContext.route}`);
  }
  if (appContext.entityId && appContext.entityType) {
    parts.push(`Viewing ${appContext.entityType}: ${appContext.entityId}`);
  }

  return `\n\nCurrent app context:\n${parts.join('\n')}`;
}

/**
 * Build the Ego system prompt for a conversation turn.
 *
 * @param scopes     - Active scopes for this conversation.
 * @param appContext  - Current app/route context the user is viewing (optional).
 */
export function buildEgoSystemPrompt(scopes: string[], appContext?: AppContext): string {
  const scopeList = scopes.length > 0 ? scopes.join(', ') : '(all non-secret scopes)';
  const contextBlock = formatAppContextBlock(appContext);

  return `You are Ego, the conversational interface to Cerebrum \u2014 a personal knowledge management system.

Your capabilities:
- Search and retrieve knowledge from the user's engram library
- Answer questions grounded in stored engrams
- Help the user explore connections between their stored knowledge

Active scopes for this conversation: ${scopeList}${contextBlock}

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
