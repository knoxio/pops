/**
 * Context-awareness helpers for the ego conversation engine (PRD-087 US-03):
 *  - biasScopes: additive scope biasing based on the active app context
 *  - loadViewedEngram: auto-load the viewed engram as a synthetic RetrievalResult
 *
 * Pillar delta: `loadViewedEngram` takes an injected {@link EngramService}
 * rather than reaching for the monolith singleton.
 */
import type { EngramService } from '../engrams/service.js';
import type { RetrievalResult } from '../retrieval/types.js';
import type { AppContext } from './types.js';

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
export function loadViewedEngram(
  engramService: EngramService,
  appContext?: AppContext
): RetrievalResult | null {
  if (!appContext?.entityId || appContext.entityType !== 'engram') return null;

  try {
    const { engram, body } = engramService.read(appContext.entityId);
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
    console.warn(
      `[cerebrum-ego] Failed to auto-load viewed engram ${appContext.entityId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}
