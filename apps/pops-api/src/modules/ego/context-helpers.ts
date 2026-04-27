/**
 * Context awareness helpers for the Ego conversation engine (PRD-087 US-03).
 *
 * Extracted from engine.ts to keep file sizes manageable:
 *  - biasScopes: additive scope biasing based on active app context
 *  - loadViewedEngram: auto-load viewed engram as a synthetic RetrievalResult
 */
import { logger } from '../../lib/logger.js';
import { getEngramService } from '../cerebrum/instance.js';

import type { RetrievalResult } from '../cerebrum/retrieval/types.js';
import type { AppContext } from './types.js';

/**
 * Mapping from pops app names to scope prefixes used for retrieval biasing.
 * When the user is in a specific app, these prefixes are added (additively)
 * to the retrieval filter scopes so that app-relevant engrams rank higher.
 */
const APP_SCOPE_PREFIXES: Record<string, string[]> = {
  finance: ['personal.finance'],
  media: ['personal.media'],
  inventory: ['personal.inventory'],
  cerebrum: [],
  ai: ['personal.ai', 'work.ai'],
};

/**
 * Bias retrieval scopes towards the active app. Adds app-relevant scope
 * prefixes to the existing scopes (additive, not exclusive). Deduplicates.
 */
export function biasScopes(scopes: string[], appContext?: AppContext): string[] {
  if (!appContext) return scopes;
  const prefixes = APP_SCOPE_PREFIXES[appContext.app];
  if (!prefixes || prefixes.length === 0) return scopes;

  const biased = new Set(scopes);
  for (const prefix of prefixes) {
    biased.add(prefix);
  }
  return [...biased];
}

/**
 * Auto-load the viewed engram as a synthetic RetrievalResult with score 1.0.
 * Only triggers when `appContext.entityType === 'engram'` and entityId is set.
 */
export function loadViewedEngram(appContext?: AppContext): RetrievalResult | null {
  if (!appContext?.entityId || appContext.entityType !== 'engram') return null;

  try {
    const { engram, body } = getEngramService().read(appContext.entityId);
    return {
      sourceType: 'engram',
      sourceId: engram.id,
      title: engram.title,
      contentPreview: body.slice(0, 500),
      score: 1.0,
      matchType: 'structured',
      metadata: {
        type: engram.type,
        scopes: engram.scopes,
        tags: engram.tags,
        createdAt: engram.created,
        autoLoaded: true,
      },
    };
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), engramId: appContext.entityId },
      '[Ego] Failed to auto-load viewed engram — continuing without it'
    );
    return null;
  }
}
