/**
 * Shelves wrapping the standalone discovery sections so they can participate in
 * session assembly: trending (TMDB), recommendations, from-your-watchlist,
 * worth-rewatching, from-your-server.
 *
 * NOTE: the monolith's `trending-plex` shelf is a Plex-Discover-backed path.
 * The Plex Discover client is NOT ported yet (wave-3 follow-up), so that shelf
 * is intentionally omitted from the registry — the session simply has one
 * fewer external shelf until Plex-Discover lands.
 *
 * Ported from the monolith `shelf/existing-shelves.ts`.
 */
import { discoveryService } from '../../../../db/index.js';
import { getFromYourServer } from '../basic.js';
import { getRecommendations } from '../recommendations.js';
import { getWatchlistRecommendations } from '../recommendations.js';
import { getTrending } from '../trending.js';

import type { DiscoverResult, RewatchSuggestion } from '../../../../db/index.js';
import type { ShelfDefinition, ShelfGenerateArgs, ShelfInstance } from './types.js';

const RECOMMENDATIONS_MIN_COMPARISONS = 5;
const RECOMMENDATIONS_SAMPLE = 10;
const TMDB_PAGE_SIZE = 20;

/** Map a RewatchSuggestion onto the DiscoverResult wire shape. */
function rewatchToDiscoverResult(r: RewatchSuggestion): DiscoverResult {
  return {
    tmdbId: r.tmdbId,
    title: r.title,
    overview: '',
    releaseDate: r.releaseDate ?? '',
    posterPath: r.posterPath,
    posterUrl: r.posterUrl,
    backdropPath: null,
    voteAverage: r.voteAverage ?? 0,
    voteCount: 0,
    genreIds: [],
    popularity: 0,
    inLibrary: r.inLibrary,
    isWatched: true,
    onWatchlist: false,
  };
}

export const trendingTmdbShelf: ShelfDefinition = {
  id: 'trending-tmdb',
  template: false,
  category: 'tmdb',
  generate({ deps }: ShelfGenerateArgs): ShelfInstance[] {
    return [
      {
        shelfId: 'trending-tmdb',
        title: 'Trending',
        subtitle: 'What everyone is watching this week',
        emoji: '🔥',
        score: 0.5,
        query: async ({ limit, offset }) => {
          const page = Math.floor(offset / TMDB_PAGE_SIZE) + 1;
          const { results } = await getTrending(deps, 'week', page);
          const start = offset % TMDB_PAGE_SIZE;
          return results.slice(start, start + limit);
        },
      },
    ];
  },
};

export const recommendationsShelf: ShelfDefinition = {
  id: 'recommendations',
  template: false,
  category: 'profile',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    return [
      {
        shelfId: 'recommendations',
        title: 'Recommended for You',
        subtitle: 'Based on your highest-rated movies',
        emoji: '⭐',
        score: 0.9,
        query: async ({ limit, offset }) => {
          if (profile.totalComparisons < RECOMMENDATIONS_MIN_COMPARISONS) return [];
          const { results } = await getRecommendations(deps, RECOMMENDATIONS_SAMPLE);
          const scored = discoveryService.scoreDiscoverResults(results, profile);
          return scored.slice(offset, offset + limit);
        },
      },
    ];
  },
};

export const fromYourWatchlistShelf: ShelfDefinition = {
  id: 'from-your-watchlist',
  template: false,
  category: 'tmdb',
  generate({ deps }: ShelfGenerateArgs): ShelfInstance[] {
    return [
      {
        shelfId: 'from-your-watchlist',
        title: 'From Your Watchlist',
        subtitle: 'Movies similar to your watchlist picks',
        emoji: '📋',
        score: 0.7,
        query: async ({ limit, offset }) => {
          const { results } = await getWatchlistRecommendations(deps);
          return results.slice(offset, offset + limit);
        },
      },
    ];
  },
};

export const worthRewatchingShelf: ShelfDefinition = {
  id: 'worth-rewatching',
  template: false,
  category: 'local',
  generate({ deps }: ShelfGenerateArgs): ShelfInstance[] {
    return [
      {
        shelfId: 'worth-rewatching',
        title: 'Worth Rewatching',
        subtitle: 'Your classics — time for a revisit',
        emoji: '🔁',
        score: 0.65,
        query: ({ limit, offset }) => {
          const suggestions = discoveryService.getRewatchSuggestions(deps.db);
          return Promise.resolve(
            suggestions.slice(offset, offset + limit).map(rewatchToDiscoverResult)
          );
        },
      },
    ];
  },
};

export const fromYourServerShelf: ShelfDefinition = {
  id: 'from-your-server',
  template: false,
  category: 'local',
  generate({ deps }: ShelfGenerateArgs): ShelfInstance[] {
    return [
      {
        shelfId: 'from-your-server',
        title: 'Ready on Your Server',
        subtitle: 'Unwatched movies already in your library',
        emoji: '🖥️',
        score: 0.75,
        query: ({ limit, offset }) => {
          const { results } = getFromYourServer(deps.db);
          return Promise.resolve(results.slice(offset, offset + limit));
        },
      },
    ];
  },
};
