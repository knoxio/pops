/**
 * Context shelf — a single template definition that emits one instance per
 * currently-active {@link ContextCollection} (date-night, halloween, …).
 *
 * Inactive collections produce no instance and are silently excluded from the
 * session. Results are NOT profile-scored (the monolith surfaced them in raw
 * vote-average order).
 *
 * Ported from the monolith `shelf/context-shelves.ts`.
 */
import { CONTEXT_COLLECTIONS, type ContextCollection } from '../context-collections.js';
import { rawTmdbShelfQuery } from './shelf-query.js';

import type { DiscoveryDeps } from '../deps.js';
import type { ShelfDefinition, ShelfGenerateArgs, ShelfInstance } from './types.js';

const FALLBACK_SCORE = 0.4;
const CONTEXT_SCORE = 0.7;

function buildContextInstance(deps: DiscoveryDeps, collection: ContextCollection): ShelfInstance {
  return {
    shelfId: `context:${collection.id}`,
    title: collection.title,
    emoji: collection.emoji,
    score: collection.id === 'rainy-day' ? FALLBACK_SCORE : CONTEXT_SCORE,
    query: (opts) =>
      rawTmdbShelfQuery({
        deps,
        opts,
        fetch: (page) =>
          deps.tmdbClient.discoverMovies({
            genreIds: collection.genreIds.length > 0 ? collection.genreIds : undefined,
            keywordIds: collection.keywordIds.length > 0 ? collection.keywordIds : undefined,
            sortBy: 'vote_average.desc',
            voteCountGte: 100,
            page,
          }),
      }),
  };
}

export const contextShelfDefinition: ShelfDefinition = {
  id: 'context',
  template: true,
  category: 'context',
  generate({ deps }: ShelfGenerateArgs): ShelfInstance[] {
    const now = new Date();
    const hour = now.getHours();
    const month = now.getMonth() + 1;
    const dayOfWeek = now.getDay();
    return CONTEXT_COLLECTIONS.filter((col) => col.trigger(hour, month, dayOfWeek)).map((col) =>
      buildContextInstance(deps, col)
    );
  },
};
