/**
 * Context shelf definitions — time/occasion-triggered shelves.
 *
 * Each shelf is active only when its trigger condition matches the current
 * hour, day-of-week, and month. Inactive shelves generate no instances and
 * are silently excluded from session assembly.
 *
 * Wraps the existing CONTEXT_COLLECTIONS definitions from context-collections.ts.
 * No query logic is re-implemented — all TMDB calls delegate to discoverMovies.
 *
 * Shelves (one ShelfDefinition per ContextCollection):
 *   date-night        — Friday/Saturday evening, Romance + Comedy
 *   sunday-flicks     — Sunday, Drama
 *   late-night        — After 22:00 or before 03:00, Thriller + Mystery
 *   halloween         — October, Horror + halloween keyword
 *   christmas         — December, christmas keyword
 *   oscar-season      — February/March, Oscar/academy-award keywords
 *   rainy-day         — Always active (fallback), Comedy + Drama + Animation
 */
import { getTmdbClient } from "../../tmdb/index.js";
import { toDiscoverResults, getLibraryTmdbIds } from "../tmdb-service.js";
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from "../flags.js";
import { CONTEXT_COLLECTIONS, type ContextCollection } from "../context-collections.js";
import { registerShelf } from "./registry.js";
import type { ShelfDefinition, ShelfInstance } from "./types.js";
import type { PreferenceProfile } from "../types.js";

/** Score for a context shelf that is always active (rainy-day fallback). */
const FALLBACK_SCORE = 0.4;
/** Score for a context shelf that is time-triggered. */
const CONTEXT_SCORE = 0.7;

/** Build a ShelfDefinition from a ContextCollection. */
function buildContextShelf(collection: ContextCollection): ShelfDefinition {
  const isFallback = collection.id === "rainy-day";

  return {
    id: collection.id,
    template: true,
    category: "context",
    generate(_profile: PreferenceProfile): ShelfInstance[] {
      const now = new Date();
      const hour = now.getHours();
      const month = now.getMonth() + 1; // JS months are 0-indexed
      const dayOfWeek = now.getDay();

      if (!collection.trigger(hour, month, dayOfWeek)) {
        return [];
      }

      const shelfId = `context:${collection.id}`;

      return [
        {
          shelfId,
          title: collection.title,
          emoji: collection.emoji,
          score: isFallback ? FALLBACK_SCORE : CONTEXT_SCORE,
          query: async ({ limit, offset }) => {
            const client = getTmdbClient();
            const page = Math.floor(offset / 20) + 1;

            const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] =
              await Promise.all([
                client.discoverMovies({
                  genreIds: collection.genreIds.length > 0 ? collection.genreIds : undefined,
                  keywordIds: collection.keywordIds.length > 0 ? collection.keywordIds : undefined,
                  sortBy: "vote_average.desc",
                  voteCountGte: 100,
                  page,
                }),
                Promise.resolve(getLibraryTmdbIds()),
                Promise.resolve(getWatchedTmdbIds()),
                Promise.resolve(getWatchlistTmdbIds()),
                Promise.resolve(getDismissedTmdbIds()),
              ]);

            const raw = toDiscoverResults(
              response.results,
              libraryIds,
              watchedIds,
              watchlistIds
            ).filter((r) => !dismissedIds.has(r.tmdbId));

            const start = offset % 20;
            return raw.slice(start, start + limit);
          },
        },
      ];
    },
  };
}

// ---------------------------------------------------------------------------
// Build and register one ShelfDefinition per ContextCollection
// ---------------------------------------------------------------------------

export const contextShelves: ShelfDefinition[] = CONTEXT_COLLECTIONS.map(buildContextShelf);

for (const shelf of contextShelves) {
  registerShelf(shelf);
}
