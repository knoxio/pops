/**
 * Shelf definitions that wrap the existing 6 discovery sections.
 *
 * Each shelf delegates to an existing service function — no query logic is
 * re-implemented here. The wrapping allows these sections to participate in
 * the shelf pool and session assembly.
 *
 * Shelves:
 *   trending-tmdb      — TMDB trending (week window)
 *   trending-plex      — Plex Discover trending (hidden when disconnected)
 *   recommendations    — Scored TMDB recs from top library movies (cold-start guard)
 *   from-your-watchlist — TMDB similar for watchlist movies
 *   worth-rewatching   — Local library movies watched 6+ months ago with high ELO
 *   from-your-server   — Unwatched library movies scored by preference profile
 */
import { getTmdbClient } from '../../tmdb/index.js';
import * as plexService from '../plex-service.js';
import * as service from '../service.js';
import * as tmdbService from '../tmdb-service.js';
import { registerShelf } from './registry.js';

import type { DiscoverResult, PreferenceProfile, RewatchSuggestion } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

/** Map a RewatchSuggestion to the DiscoverResult interface. */
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

// ---------------------------------------------------------------------------
// trending-tmdb: TMDB trending movies (weekly)
// ---------------------------------------------------------------------------

export const trendingTmdbShelf: ShelfDefinition = {
  id: 'trending-tmdb',
  template: false,
  category: 'tmdb',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'trending-tmdb',
        title: 'Trending',
        subtitle: 'What everyone is watching this week',
        emoji: '🔥',
        score: 0.5,
        query: async ({ limit, offset }) => {
          const client = getTmdbClient();
          const page = Math.floor(offset / 20) + 1;
          const { results } = await tmdbService.getTrending(client, 'week', page);
          const start = offset % 20;
          return results.slice(start, start + limit);
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// trending-plex: Plex Discover trending (hidden when disconnected)
// ---------------------------------------------------------------------------

export const trendingPlexShelf: ShelfDefinition = {
  id: 'trending-plex',
  template: false,
  category: 'external',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'trending-plex',
        title: 'Trending on Plex',
        subtitle: 'Popular on Plex Discover right now',
        emoji: '📺',
        score: 0.55,
        query: async ({ limit, offset }) => {
          const results = await plexService.getTrendingFromPlex(limit + offset);
          if (!results) return [];
          return results.slice(offset, offset + limit);
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// recommendations: TMDB recs from top-rated library movies, scored by profile
// ---------------------------------------------------------------------------

export const recommendationsShelf: ShelfDefinition = {
  id: 'recommendations',
  template: false,
  category: 'profile',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'recommendations',
        title: 'Recommended for You',
        subtitle: 'Based on your highest-rated movies',
        emoji: '⭐',
        score: 0.9,
        query: async ({ limit, offset }) => {
          const profile = service.getPreferenceProfile();
          // Cold-start guard: require at least 5 comparisons for meaningful recs
          if (profile.totalComparisons < 5) return [];

          const client = getTmdbClient();
          const { results } = await tmdbService.getRecommendations(client, 10);
          const scored = service.scoreDiscoverResults(results, profile);
          scored.sort((a, b) => b.matchPercentage - a.matchPercentage);
          return scored.slice(offset, offset + limit);
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// from-your-watchlist: TMDB similar movies for watchlist items
// ---------------------------------------------------------------------------

export const fromYourWatchlistShelf: ShelfDefinition = {
  id: 'from-your-watchlist',
  template: false,
  category: 'tmdb',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'from-your-watchlist',
        title: 'From Your Watchlist',
        subtitle: 'Movies similar to your watchlist picks',
        emoji: '📋',
        score: 0.7,
        query: async ({ limit, offset }) => {
          const client = getTmdbClient();
          const { results } = await tmdbService.getWatchlistRecommendations(client);
          return results.slice(offset, offset + limit);
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// worth-rewatching: library movies watched 6+ months ago with high ELO
// ---------------------------------------------------------------------------

export const worthRewatchingShelf: ShelfDefinition = {
  id: 'worth-rewatching',
  template: false,
  category: 'local',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'worth-rewatching',
        title: 'Worth Rewatching',
        subtitle: 'Your classics — time for a revisit',
        emoji: '🔁',
        score: 0.65,
        query: ({ limit, offset }) => {
          const suggestions = service.getRewatchSuggestions();
          const results = suggestions.slice(offset, offset + limit).map(rewatchToDiscoverResult);
          return Promise.resolve(results);
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// from-your-server: unwatched library movies scored by preference profile
// ---------------------------------------------------------------------------

export const fromYourServerShelf: ShelfDefinition = {
  id: 'from-your-server',
  template: false,
  category: 'local',
  generate(_profile: PreferenceProfile): ShelfInstance[] {
    return [
      {
        shelfId: 'from-your-server',
        title: 'Ready on Your Server',
        subtitle: 'Unwatched movies already in your library',
        emoji: '🖥️',
        score: 0.75,
        query: ({ limit, offset }) => {
          const unwatched = service.getUnwatchedLibraryMovies();
          if (unwatched.length === 0) return Promise.resolve([]);
          const profile = service.getPreferenceProfile();
          const scored = service.scoreDiscoverResults(unwatched, profile);
          scored.sort((a, b) => b.matchPercentage - a.matchPercentage);
          return Promise.resolve(scored.slice(offset, offset + limit));
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// Register all shelves on module load
// ---------------------------------------------------------------------------

registerShelf(trendingTmdbShelf);
registerShelf(trendingPlexShelf);
registerShelf(recommendationsShelf);
registerShelf(fromYourWatchlistShelf);
registerShelf(worthRewatchingShelf);
registerShelf(fromYourServerShelf);
