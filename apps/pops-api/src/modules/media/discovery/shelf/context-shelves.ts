/**
 * Context shelf definition — time/occasion-triggered shelf.
 *
 * A single ShelfDefinition with id="context" generates one ShelfInstance per
 * currently-active ContextCollection. This allows getShelfPage to correctly
 * resolve instances: "context:date-night".split(":")[0] === "context" finds
 * this definition, then generate() returns all active instances including the
 * one matching the requested shelfId.
 *
 * Inactive collections produce no instance and are silently excluded from
 * session assembly.
 *
 * Instance shelfIds:
 *   context:date-night        — Friday/Saturday evening, Romance + Comedy
 *   context:sunday-flicks     — Sunday, Drama
 *   context:late-night        — After 22:00 or before 03:00, Thriller + Mystery
 *   context:halloween         — October, Horror + halloween keyword
 *   context:christmas         — December, christmas keyword
 *   context:oscar-season      — February/March, Oscar/academy-award keywords
 *   context:rainy-day         — Always active (fallback), Comedy + Drama + Animation
 */
import { getTmdbClient } from '../../tmdb/index.js';
import { CONTEXT_COLLECTIONS, type ContextCollection } from '../context-collections.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from '../flags.js';
import { getLibraryTmdbIds, toDiscoverResults } from '../tmdb-service.js';
import type { PreferenceProfile } from '../types.js';
import { registerShelf } from './registry.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

/** Score for a context shelf that is always active (rainy-day fallback). */
const FALLBACK_SCORE = 0.4;
/** Score for a context shelf that is time-triggered. */
const CONTEXT_SCORE = 0.7;

/** Build a ShelfInstance from an active ContextCollection. */
function buildContextInstance(collection: ContextCollection): ShelfInstance {
  const isFallback = collection.id === 'rainy-day';

  return {
    shelfId: `context:${collection.id}`,
    title: collection.title,
    emoji: collection.emoji,
    score: isFallback ? FALLBACK_SCORE : CONTEXT_SCORE,
    query: async ({ limit, offset }) => {
      const client = getTmdbClient();
      const page = Math.floor(offset / 20) + 1;

      const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
        client.discoverMovies({
          genreIds: collection.genreIds.length > 0 ? collection.genreIds : undefined,
          keywordIds: collection.keywordIds.length > 0 ? collection.keywordIds : undefined,
          sortBy: 'vote_average.desc',
          voteCountGte: 100,
          page,
        }),
        Promise.resolve(getLibraryTmdbIds()),
        Promise.resolve(getWatchedTmdbIds()),
        Promise.resolve(getWatchlistTmdbIds()),
        Promise.resolve(getDismissedTmdbIds()),
      ]);

      const raw = toDiscoverResults(response.results, libraryIds, watchedIds, watchlistIds).filter(
        (r) => !dismissedIds.has(r.tmdbId)
      );

      const start = offset % 20;
      return raw.slice(start, start + limit);
    },
  };
}

// ---------------------------------------------------------------------------
// Single ShelfDefinition that generates all currently-active context instances
// ---------------------------------------------------------------------------

export const contextShelfDefinition: ShelfDefinition = {
  id: 'context',
  template: true,
  category: 'context',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    const now = new Date();
    const hour = now.getHours();
    const month = now.getMonth() + 1; // JS months are 0-indexed
    const dayOfWeek = now.getDay();

    return CONTEXT_COLLECTIONS.filter((col) => col.trigger(hour, month, dayOfWeek)).map(
      buildContextInstance
    );
  },
};

registerShelf(contextShelfDefinition);
